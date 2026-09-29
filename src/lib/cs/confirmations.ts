import "server-only";

import type { AdminOrder } from "@/lib/orders";
import { getAdminOrder, getAdminOrders } from "@/lib/orders";
import { getPrismaClient } from "@/lib/db";
import {
  CS_CHECKLIST_ITEMS,
  CS_CONFIRMATION_STATUS,
  CS_FOLLOWUP_ITEMS,
  type CsChecklistAnswerInput,
  validateChecklistAnswers,
} from "@/lib/cs/checklist";
import { ensureCsTables } from "@/lib/cs/agents";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { resolveHandedToCarrierAt } from "@/lib/cs/temima-sheet";
import { attachBostaWaybillByOrderReference, syncCsBostaWaybill } from "@/lib/cs/bosta-waybill";
import {
  parseWooOrderNumber,
} from "@/lib/cs/assignments";
import {
  cairoDaysAgoYmd,
  cairoYmdBounds,
  isWithinCairoLastDays,
  isWithinCairoTodayOrYesterday,
  resolvePaymentState,
  type CsPaymentState,
} from "@/lib/cs/order-window";
import { getShipmentsByOrderIds } from "@/lib/shipping/shipments";
import { looksLikeLocationCode, resolveSnapshotLocation } from "@/lib/cs/resolve-location";

export type CsQueueSnapshot = {
  customerName?: string;
  phone?: string;
  address?: string;
  governorate?: string;
  area?: string;
  total?: string;
  dateCreated?: string;
  paymentMethod?: string;
  paymentMethodId?: string | null;
  paidOnlineHighlight?: boolean;
  paymentState?: CsPaymentState;
  datePaid?: string | null;
  wooStatus?: string;
  trackingNumber?: string | null;
  items?: Array<{ name: string; quantity?: number; total?: string; sku?: string }>;
  freeShippingHint?: string;
  number?: string;
  currency?: string;
  status?: string;
};

async function trackingMapForOrders(orderIds: number[]) {
  try {
    const map = await getShipmentsByOrderIds(orderIds);
    const out = new Map<number, string | null>();
    for (const id of orderIds) {
      out.set(id, map.get(id)?.trackingNumber || null);
    }
    return out;
  } catch {
    return new Map<number, string | null>();
  }
}

function snapshotFromOrder(order: AdminOrder, trackingNumber?: string | null) {
  const paymentState = resolvePaymentState({
    paymentMethod: order.paymentMethod,
    paymentMethodId: order.paymentMethodId,
    wooStatus: order.status,
    datePaid: order.datePaid,
  });
  return {
    id: order.id,
    number: order.number,
    customerName: order.customerName,
    phone: order.phone,
    address: order.address,
    governorate: order.governorate,
    area: order.area,
    status: order.status,
    wooStatus: order.status,
    paymentMethod: order.paymentMethod,
    paymentMethodId: order.paymentMethodId || null,
    datePaid: order.datePaid || null,
    paymentState,
    total: order.total,
    currency: order.currency,
    dateCreated: order.dateCreated,
    paidOnlineHighlight: paymentState === "paid",
    trackingNumber: trackingNumber || order.shipping?.trackingNumber || null,
    items: order.items,
    freeShippingHint: "راجع رسوم الشحن مع العميل حسب سياسة المتجر",
  };
}

function sortByOrderNumberDesc<T extends { wooOrderNumber: string }>(rows: T[]) {
  return [...rows].sort(
    (a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber),
  );
}

/** Order total at/above this (EGP) shows the optional deposit card on the call sheet. */
export const CS_DEPOSIT_THRESHOLD = 5000;

export const CS_DEPOSIT_COMPANY_PHONES = ["01000260262", "01037333490"] as const;

export type CsDepositPayMethod = "wallet" | "instapay";

export function parseDepositAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function serializeDepositAmount(value: unknown): number | null {
  return parseDepositAmount(value);
}

export function normalizeDepositPayMethod(value: unknown): CsDepositPayMethod | null {
  const s = String(value || "").trim().toLowerCase();
  if (s === "wallet" || s === "instapay") return s;
  return null;
}

export function normalizeDepositFromNumber(value: unknown): string | null {
  const s = String(value || "").trim();
  return s || null;
}

export function parseOrderTotalDelta(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const n = (value as { toNumber: () => number }).toNumber();
    if (!Number.isFinite(n) || n === 0) return null;
    return Math.round(n * 100) / 100;
  }
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(n * 100) / 100;
}

export function normalizeDepositInstapayName(value: unknown): string | null {
  const s = String(value || "").trim().replace(/\s+/g, " ").slice(0, 191);
  return s || null;
}

export function normalizeDepositToPhone(value: unknown): string | null {
  const s = String(value || "").trim();
  if ((CS_DEPOSIT_COMPANY_PHONES as readonly string[]).includes(s)) return s;
  return null;
}

const SYNC_PAGE_SIZE = 100;
const SYNC_PAGES_PER_TICK = 4;
const SKIP_WOO_STATUS = new Set(["trash", "auto-draft", "checkout-draft"]);

type CsSyncState = { nextPage: number; slowPage: number; historyDone: boolean };

function syncFlagOn(value: unknown) {
  return value === true || value === "1" || Number(value) === 1;
}

async function readCsSyncState(prisma: NonNullable<ReturnType<typeof getPrismaClient>>): Promise<CsSyncState> {
  const rows = await prisma.$queryRaw<
    Array<{ nextPage: number | bigint; slowPage: number | bigint; historyDone: boolean | number | bigint }>
  >`SELECT nextPage, slowPage, historyDone FROM CsOrderSyncState WHERE id = 1`;
  if (!rows.length) {
    await prisma.$executeRaw`INSERT INTO CsOrderSyncState (id, nextPage, slowPage, historyDone) VALUES (1, 1, 1, false)`;
    return { nextPage: 1, slowPage: 1, historyDone: false };
  }
  const row = rows[0];
  return {
    nextPage: Math.max(1, Number(row.nextPage) || 1),
    slowPage: Math.max(1, Number(row.slowPage) || 1),
    historyDone: syncFlagOn(row.historyDone),
  };
}

async function writeCsSyncState(prisma: NonNullable<ReturnType<typeof getPrismaClient>>, state: CsSyncState) {
  await prisma.$executeRaw`
    UPDATE CsOrderSyncState
    SET nextPage = ${state.nextPage}, slowPage = ${state.slowPage}, historyDone = ${state.historyDone}
    WHERE id = 1
  `;
}

async function importWooOrdersForCs(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  orders: AdminOrder[],
) {
  const kept = orders.filter((order) => !SKIP_WOO_STATUS.has(order.status));
  const tracking = await trackingMapForOrders(kept.map((order) => order.id));
  const shipmentByWoo = new Map<number, { governorate: string; area: string }>();
  try {
    const ships = await getShipmentsByOrderIds(kept.map((order) => order.id));
    for (const [wooId, ship] of ships) {
      if (ship?.governorate || ship?.area) {
        shipmentByWoo.set(wooId, { governorate: ship.governorate || "", area: ship.area || "" });
      }
    }
  } catch {
    // shipping tables optional
  }

  let imported = 0;
  for (const order of kept) {
    const snap = snapshotFromOrder(order, tracking.get(order.id)) as CsQueueSnapshot & {
      governorate?: string;
      area?: string;
    };
    const fromShip = shipmentByWoo.get(order.id);
    if (fromShip) {
      const govBad = !snap.governorate || snap.governorate === "غير محدد" || looksLikeLocationCode(snap.governorate);
      const areaBad = !snap.area || snap.area === "غير محدد" || looksLikeLocationCode(snap.area);
      if (govBad && fromShip.governorate && !looksLikeLocationCode(fromShip.governorate)) {
        snap.governorate = fromShip.governorate;
      }
      if (areaBad && fromShip.area && !looksLikeLocationCode(fromShip.area)) {
        snap.area = fromShip.area;
      }
    }

    const existing = await prisma.csOrderConfirmation.findUnique({ where: { wooOrderId: order.id } });
    if (existing) {
      await prisma.csOrderConfirmation.update({
        where: { id: existing.id },
        data: {
          wooOrderNumber: order.number,
          customerSnapshot: snap,
          ...(!existing.shippingCompany ? { shippingCompany: "bosta" } : {}),
        },
      });
      continue;
    }

    await prisma.csOrderConfirmation.create({
      data: {
        wooOrderId: order.id,
        wooOrderNumber: order.number,
        status: CS_CONFIRMATION_STATUS.PENDING,
        customerSnapshot: snap,
        shippingCompany: "bosta",
      },
    });
    imported += 1;
  }

  return { imported, kept: kept.length };
}

export async function syncRecentOrdersForCs(_options?: { perPage?: number }) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة.", imported: 0, totalFetched: 0 };
  }

  await ensureCsTables();
  const state = await readCsSyncState(prisma);
  let imported = 0;
  let totalFetched = 0;
  let pagesUsed = 0;
  let pageOneOrders: AdminOrder[] = [];

  async function pullPage(page: number) {
    const result = await getAdminOrders({ perPage: String(SYNC_PAGE_SIZE), page: String(page) });
    if (result.error) return { error: result.error, rawCount: 0, imported: 0 };
    const saved = await importWooOrdersForCs(prisma!, result.orders);
    imported += saved.imported;
    totalFetched += result.orders.length;
    pagesUsed += 1;
    if (page === 1) pageOneOrders = result.orders;
    return { error: null as string | null, rawCount: result.orders.length, imported: saved.imported };
  }

  if (!state.historyDone) {
    if (state.nextPage > 1) {
      const newest = await pullPage(1);
      if (newest.error) {
        await writeCsSyncState(prisma, state);
        return { ok: false as const, message: newest.error, imported, totalFetched };
      }
    }
    while (pagesUsed < SYNC_PAGES_PER_TICK) {
      const pulled = await pullPage(state.nextPage);
      if (pulled.error) {
        await writeCsSyncState(prisma, state);
        return { ok: false as const, message: pulled.error, imported, totalFetched };
      }
      if (pulled.rawCount < SYNC_PAGE_SIZE) {
        state.historyDone = true;
        state.nextPage = 1;
        state.slowPage = 2;
        break;
      }
      state.nextPage += 1;
    }
  } else {
    let page = 1;
    while (pagesUsed < SYNC_PAGES_PER_TICK) {
      const pulled = await pullPage(page);
      if (pulled.error) {
        await writeCsSyncState(prisma, state);
        return { ok: false as const, message: pulled.error, imported, totalFetched };
      }
      if (pulled.rawCount < SYNC_PAGE_SIZE || pulled.imported === 0) break;
      page += 1;
    }
    if (pagesUsed < SYNC_PAGES_PER_TICK) {
      const pulled = await pullPage(state.slowPage);
      if (pulled.error) {
        await writeCsSyncState(prisma, state);
        return { ok: false as const, message: pulled.error, imported, totalFetched };
      }
      state.slowPage = pulled.rawCount < SYNC_PAGE_SIZE ? 1 : state.slowPage + 1;
    }
  }

  await writeCsSyncState(prisma, state);
  if (state.historyDone && pageOneOrders.length) {
    await linkMissingBostaWaybills(prisma, pageOneOrders);
  }

  return { ok: true as const, imported, totalFetched };
}

async function linkMissingBostaWaybills(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  orders: AdminOrder[],
) {
  const missing = await prisma.csOrderConfirmation.findMany({
    where: {
      AND: [
        { OR: [{ trackingNumber: null }, { trackingNumber: "" }] },
        { OR: [{ shippingCompany: "bosta" }, { shippingCompany: null }, { shippingCompany: "sayed_temima" }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const trackingByOrder = new Map(orders.map((order) => [order.id, order.bostaTrackingNumber || ""]));
  for (const row of missing) {
    if (String(row.trackingNumber || "").trim()) continue;
    const snap = (row.customerSnapshot as { trackingNumber?: string | null } | null) || null;
    await attachBostaWaybillByOrderReference({
      confirmationId: row.id,
      wooOrderId: row.wooOrderId,
      wooOrderNumber: row.wooOrderNumber,
      snapshot: (row.customerSnapshot as Record<string, unknown> | null) || null,
      knownTracking: trackingByOrder.get(row.wooOrderId) || snap?.trackingNumber || null,
      onlyIfFound: row.shippingCompany === "sayed_temima",
    });
  }
}

export async function enqueueOrderFromWebhook(order: AdminOrder) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await ensureCsTables();
  const tracking = await trackingMapForOrders([order.id]);

  const saved = await prisma.csOrderConfirmation.upsert({
    where: { wooOrderId: order.id },
    create: {
      wooOrderId: order.id,
      wooOrderNumber: order.number,
      status: CS_CONFIRMATION_STATUS.PENDING,
      customerSnapshot: snapshotFromOrder(order, tracking.get(order.id)),
      shippingCompany: "bosta",
    },
    update: {
      wooOrderNumber: order.number,
      customerSnapshot: snapshotFromOrder(order, tracking.get(order.id)),
    },
  });
  if (!String(saved.trackingNumber || "").trim()) {
    await attachBostaWaybillByOrderReference({
      confirmationId: saved.id,
      wooOrderId: saved.wooOrderId,
      wooOrderNumber: saved.wooOrderNumber,
      snapshot: (saved.customerSnapshot as Record<string, unknown> | null) || null,
      knownTracking: order.bostaTrackingNumber || null,
      onlyIfFound: saved.shippingCompany === "sayed_temima",
    });
  }
}

async function confirmationIdsForViewer(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  opts: { agentId: number; isSupervisor: boolean; seeAll?: boolean },
) {
  if (!opts.isSupervisor && !opts.seeAll) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number | bigint }>>(
      "SELECT id FROM CsOrderConfirmation WHERE assignedAgentId = ? ORDER BY id DESC LIMIT 2000",
      opts.agentId,
    );
    return rows.map((row) => Number(row.id));
  }
  const since = cairoDaysAgoYmd(32);
  const sinceAt = `${since} 00:00:00`;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number | bigint }>>(
    `SELECT id FROM CsOrderConfirmation
     WHERE (
       LEFT(JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.dateCreated')), 10) >= ?
       OR (confirmedAt IS NOT NULL AND confirmedAt >= ?)
       OR (handedToCarrierAt IS NOT NULL AND handedToCarrierAt >= ?)
       OR (startedAt IS NOT NULL AND startedAt >= ?)
     )
     ORDER BY id DESC
     LIMIT 8000`,
    since,
    sinceAt,
    sinceAt,
    sinceAt,
  );
  return rows.map((row) => Number(row.id));
}

async function loadConfirmationsByIds(prisma: NonNullable<ReturnType<typeof getPrismaClient>>, ids: number[]) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    if (!chunk.length) continue;
    const part = await prisma.csOrderConfirmation.findMany({
      where: { id: { in: chunk } },
      include: { assignedAgent: true, answers: true },
    });
    rows.push(...part);
  }
  return rows;
}

function isQueueYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function queueLikePattern(query: string) {
  return `%${query.trim().slice(0, 80).replace(/[\\%_]/g, "")}%`;
}

export async function listCsConfirmationsForViewer(opts: {
  agentId: number;
  isSupervisor: boolean;
  seeAll?: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();

  type Row = Awaited<ReturnType<typeof prisma.csOrderConfirmation.findMany>>[number] & {
    assignedAgent?: { id: number; name: string } | null;
    answers?: Array<{ itemKey: string; confirmed: boolean; value: string | null; note: string | null }>;
    shippingCompany?: string | null;
    handedToCarrier?: boolean;
    deliveredToCustomer?: boolean;
    customerFollowUp?: boolean;
  };

  let rows: Row[] = [];
  try {
    const ids = await confirmationIdsForViewer(prisma, opts);
    rows = (await loadConfirmationsByIds(prisma, ids)) as Row[];
  } catch (error) {
    console.error("[cs] listCsConfirmationsForViewer failed, retry after migrate:", error);
    await ensureCsTables();
    try {
      const ids = await confirmationIdsForViewer(prisma, opts);
      rows = (await loadConfirmationsByIds(prisma, ids)) as Row[];
    } catch (retryError) {
      console.error("[cs] listCsConfirmationsForViewer legacy fallback:", retryError);
      const legacy = await prisma.$queryRawUnsafe<
        Array<{
          id: number;
          wooOrderId: number;
          wooOrderNumber: string;
          status: string;
          assignedAgentId: number | null;
          customerSnapshot: unknown;
          failReason: string | null;
          startedAt: Date | null;
          confirmedAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
        }>
      >(
        `SELECT \`id\`, \`wooOrderId\`, \`wooOrderNumber\`, \`status\`, \`assignedAgentId\`, \`customerSnapshot\`, \`failReason\`, \`startedAt\`, \`confirmedAt\`, \`createdAt\`, \`updatedAt\`
         FROM \`CsOrderConfirmation\` ORDER BY \`createdAt\` DESC LIMIT 3000`,
      );
      const agentIds = [...new Set(legacy.map((r) => r.assignedAgentId).filter(Boolean))] as number[];
      const agents =
        agentIds.length > 0
          ? await prisma.csAgent.findMany({ where: { id: { in: agentIds } } })
          : [];
      const agentById = new Map(agents.map((a) => [a.id, a]));
      rows = legacy.map((r) => ({
        ...r,
        shippingCompany: null,
        trackingNumber: null,
        waybillPrinted: false,
        depositAmount: null,
        depositPaid: false,
        depositPayMethod: null,
        depositFromNumber: null,
        depositToPhone: null,
        depositToMethod: null,
        depositPaidAt: null,
        depositProofUrl: null,
        depositApprovalStatus: "none",
        depositApprovalRequestedAt: null,
        depositApprovalDecidedAt: null,
        depositAgentDecisionSeenAt: null,
        handedToCarrier: false,
        deliveredToCustomer: false,
        customerFollowUp: false,
        handedToCarrierAt: null,
        deliveredToCustomerAt: null,
        customerFollowUpAt: null,
        assignedAgent: r.assignedAgentId ? agentById.get(r.assignedAgentId) || null : null,
        answers: [],
      })) as unknown as Row[];
    }
  }

  await attachDistributedAt(rows);

  if (!(opts.isSupervisor || opts.seeAll)) {
    return sortByOrderNumberDesc(rows.filter((row) => row.assignedAgentId === opts.agentId));
  }

  const inWindow = rows.filter((row) => {
    const distributedAt = (row as { distributedAt?: string | null }).distributedAt;
    if (distributedAt && isWithinCairoLastDays(distributedAt, 30)) return true;
    const snap = row.customerSnapshot as { dateCreated?: string } | null;
    if (isWithinCairoLastDays(snap?.dateCreated, 30)) return true;
    const workIso = [
      row.confirmedAt instanceof Date ? row.confirmedAt.toISOString() : row.confirmedAt,
      row.handedToCarrierAt instanceof Date ? row.handedToCarrierAt.toISOString() : row.handedToCarrierAt,
      row.startedAt instanceof Date ? row.startedAt.toISOString() : row.startedAt,
    ];
    return workIso.some((iso) => typeof iso === "string" && isWithinCairoLastDays(iso, 30));
  });

  return sortByOrderNumberDesc(inWindow);
}

export const CS_QUEUE_PAGE_SIZE = 200;

function sheetQueueItemMatches(
  item: ReturnType<typeof serializeCsQueueItem>,
  opts: {
    agentId: number;
    query?: string;
    followUp?: string;
    payment?: string;
    agentFilterId?: number | null;
    tracking?: string;
    waybill?: string;
  },
  seeAll: boolean,
) {
  if (!seeAll && item.assignedAgent?.id !== opts.agentId) return false;
  const query = (opts.query || "").trim().toLowerCase();
  if (query) {
    const snap = item.customerSnapshot;
    const hay = [
      item.wooOrderNumber,
      snap?.customerName,
      snap?.phone,
      snap?.address,
      snap?.addressFull,
      snap?.area,
      snap?.governorate,
      ...(snap?.items || []).map((line) => line.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(query)) return false;
  }
  if (opts.followUp && opts.followUp !== "all") {
    if (opts.followUp === "handed" && !item.handedToCarrier) return false;
    if (opts.followUp === "delivered" && !item.deliveredToCustomer) return false;
    if (opts.followUp === "followup" && !item.customerFollowUp) return false;
    if (opts.followUp === "handed_pending" && item.handedToCarrier) return false;
    if (opts.followUp === "delivered_pending" && item.deliveredToCustomer) return false;
    if (opts.followUp === "followup_pending" && item.customerFollowUp) return false;
  }
  const payment = opts.payment === "paid_online" ? "paid" : opts.payment || "all";
  if (payment === "paid" || payment === "awaiting_payment" || payment === "cod") {
    const state = item.customerSnapshot?.paymentState || "cod";
    if (state !== payment) return false;
  }
  if (opts.agentFilterId && opts.agentFilterId > 0 && item.assignedAgent?.id !== opts.agentFilterId) return false;
  if (opts.tracking === "missing") {
    const tracking = String(item.trackingNumber || item.customerSnapshot?.trackingNumber || "").trim();
    if (tracking && tracking !== "null") return false;
  }
  if (opts.waybill === "not_printed" && item.waybillPrinted) return false;
  return true;
}

const QUEUE_STATUSES = new Set(["PENDING", "IN_PROGRESS", "CONFIRMED", "FAILED_CONTACT", "CANCELLED", "DISTRIBUTED"]);

export async function listCsQueuePage(opts: {
  agentId: number;
  isSupervisor: boolean;
  seeAll?: boolean;
  dateFrom?: string;
  dateTo?: string;
  dateBasis?: string;
  query?: string;
  status?: string;
  shipping?: string;
  agentFilterId?: number | null;
  payment?: string;
  followUp?: string;
  tracking?: string;
  waybill?: string;
  page?: number;
  limit?: number;
  all?: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { items: [], total: 0, page: 1, pageSize: CS_QUEUE_PAGE_SIZE, hasMore: false };
  await ensureCsTables();

  const seeAll = Boolean(opts.isSupervisor || opts.seeAll);
  const pageSize = opts.all ? 5000 : Math.min(CS_QUEUE_PAGE_SIZE, Math.max(1, opts.limit || CS_QUEUE_PAGE_SIZE));
  const page = opts.all ? 1 : Math.max(1, Math.floor(opts.page || 1));
  const offset = (page - 1) * pageSize;
  const where: string[] = [];
  const params: Array<string | number | Date> = [];
  if (!seeAll) {
    where.push("assignedAgentId = ?");
    params.push(opts.agentId);
  }

  const query = (opts.query || "").trim();
  const dateFrom = opts.dateFrom || "";
  const dateTo = opts.dateTo || "";
  const status = QUEUE_STATUSES.has(opts.status || "") ? String(opts.status) : "all";
  const fromBounds = isQueueYmd(dateFrom) ? cairoYmdBounds(dateFrom) : null;
  const toBounds = isQueueYmd(dateTo) ? cairoYmdBounds(dateTo) : null;
  const sheetMode =
    status === "CONFIRMED" &&
    opts.shipping === "sayed_temima" &&
    opts.dateBasis === "saved" &&
    isQueueYmd(dateFrom) &&
    isQueueYmd(dateTo);
  if (sheetMode) {
    const { listUnifiedSayedSheet } = await import("@/lib/cs/temima-sheet-edits");
    let items = await listUnifiedSayedSheet(dateFrom, dateTo);
    items = items.filter((item) => sheetQueueItemMatches(item, opts, seeAll));
    const total = items.length;
    const pageItems = items.slice(offset, offset + pageSize);
    return {
      items: pageItems,
      total,
      page,
      pageSize,
      hasMore: offset + pageItems.length < total,
    };
  }
  if (query) {
    const pattern = queueLikePattern(query);
    where.push("(wooOrderNumber LIKE ? OR CAST(customerSnapshot AS CHAR) LIKE ?)");
    params.push(pattern, pattern);
  }
  if (status === "DISTRIBUTED") {
    where.push("assignedAgentId IS NOT NULL");
    if (fromBounds && toBounds) {
      where.push(`EXISTS (
        SELECT 1 FROM CsOrderAssignment a
        WHERE a.agentId = CsOrderConfirmation.assignedAgentId
        AND CAST(REPLACE(REPLACE(CsOrderConfirmation.wooOrderNumber, '#', ''), ' ', '') AS UNSIGNED)
            BETWEEN LEAST(a.wooOrderNumberFrom, a.wooOrderNumberTo) AND GREATEST(a.wooOrderNumberFrom, a.wooOrderNumberTo)
        AND a.createdAt >= ? AND a.createdAt < ?
      )`);
      params.push(fromBounds.start, toBounds.endExclusive);
    }
  } else if (isQueueYmd(dateFrom) && isQueueYmd(dateTo)) {
    if (opts.dateBasis === "saved" && fromBounds && toBounds) {
      where.push("confirmedAt >= ? AND confirmedAt < ?");
      params.push(fromBounds.start, toBounds.endExclusive);
    } else if (seeAll) {
      where.push(
        "LEFT(JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.dateCreated')), 10) >= ? AND LEFT(JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.dateCreated')), 10) <= ?",
      );
      params.push(dateFrom, dateTo);
    } else if (fromBounds && toBounds) {
      where.push(`(
        (LEFT(JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.dateCreated')), 10) >= ? AND LEFT(JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.dateCreated')), 10) <= ?)
        OR (confirmedAt >= ? AND confirmedAt < ?)
        OR (startedAt >= ? AND startedAt < ?)
        OR (handedToCarrierAt >= ? AND handedToCarrierAt < ?)
      )`);
      params.push(
        dateFrom,
        dateTo,
        fromBounds.start,
        toBounds.endExclusive,
        fromBounds.start,
        toBounds.endExclusive,
        fromBounds.start,
        toBounds.endExclusive,
      );
    }
  }
  if (status !== "all" && status !== "DISTRIBUTED") {
    where.push("status = ?");
    params.push(status);
  }
  if (status === "CONFIRMED" && opts.followUp && opts.followUp !== "all") {
    if (opts.followUp === "handed") where.push("handedToCarrier = 1");
    else if (opts.followUp === "delivered") where.push("deliveredToCustomer = 1");
    else if (opts.followUp === "followup") where.push("customerFollowUp = 1");
    else if (opts.followUp === "handed_pending") where.push("handedToCarrier = 0");
    else if (opts.followUp === "delivered_pending") where.push("deliveredToCustomer = 0");
    else if (opts.followUp === "followup_pending") where.push("customerFollowUp = 0");
  }
  const payment = opts.payment === "paid_online" ? "paid" : opts.payment || "all";
  if (payment === "paid" || payment === "awaiting_payment" || payment === "cod") {
    where.push(
      "COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.paymentState')), 'null'), 'cod') = ?",
    );
    params.push(payment);
  }
  if (opts.shipping === "bosta" || opts.shipping === "sayed_temima") {
    where.push("shippingCompany = ?");
    params.push(opts.shipping);
  }
  if (opts.agentFilterId && opts.agentFilterId > 0) {
    where.push("assignedAgentId = ?");
    params.push(opts.agentFilterId);
  }
  if (opts.tracking === "missing") {
    where.push(`(
      (trackingNumber IS NULL OR TRIM(trackingNumber) = '')
      AND (
        JSON_EXTRACT(customerSnapshot, '$.trackingNumber') IS NULL
        OR TRIM(JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.trackingNumber'))) IN ('', 'null')
      )
    )`);
  }
  if (opts.waybill === "not_printed") {
    where.push("(waybillPrinted = 0 OR waybillPrinted IS NULL)");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const counted = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT COUNT(*) AS n FROM CsOrderConfirmation ${whereSql}`,
    ...params,
  );
  const total = Number(counted[0]?.n ?? 0);
  const idRows = await prisma.$queryRawUnsafe<Array<{ id: number | bigint }>>(
    `SELECT id FROM CsOrderConfirmation ${whereSql} ORDER BY id DESC LIMIT ${pageSize} OFFSET ${offset}`,
    ...params,
  );
  const pageIds = idRows.map((row) => Number(row.id));
  const loaded = await loadConfirmationsByIds(prisma, pageIds);
  const byId = new Map(loaded.map((row) => [row.id, row]));
  const ordered = pageIds
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  await attachDistributedAt(ordered);
  return {
    items: ordered.map((row) => serializeCsQueueItem(row)),
    total,
    page,
    pageSize,
    hasMore: offset + ordered.length < total,
  };
}

/** @deprecated use listCsConfirmationsForViewer */
export async function listCsConfirmations(status?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();
  const rows = await prisma.csOrderConfirmation.findMany({
    where: status && status !== "all" ? { status } : undefined,
    include: { assignedAgent: true, answers: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return sortByOrderNumberDesc(
    rows.filter((row) => {
      const snap = row.customerSnapshot as { dateCreated?: string } | null;
      return isWithinCairoTodayOrYesterday(snap?.dateCreated);
    }),
  );
}

export function serializeCsQueueItem(row: {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  status: string;
  shippingCompany?: string | null;
  trackingNumber?: string | null;
  waybillPrinted?: boolean | null;
  depositAmount?: unknown;
  depositPaid?: boolean | null;
  depositPayMethod?: string | null;
  depositFromNumber?: string | null;
  depositToPhone?: string | null;
  depositToMethod?: string | null;
  depositPaidAt?: Date | string | null;
  depositProofUrl?: string | null;
  depositApprovalStatus?: string | null;
  handedToCarrier?: boolean | null;
  handedToCarrierAt?: Date | string | null;
  deliveredToCustomer?: boolean | null;
  customerFollowUp?: boolean | null;
  shippingAssignedAt?: Date | string | null;
  courierAgentId?: number | null;
  courierOutcome?: string | null;
  courierRefusalReason?: string | null;
  salesOrderNumber?: string | null;
    invoiceNumber?: string | null;
  bostaStatus?: string | null;
  bostaShippingFee?: unknown;
  customerSnapshot?: unknown;
  startedAt?: Date | string | null;
  confirmedAt?: Date | string | null;
  confirmationEditedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  distributedAt?: Date | string | null;
  createdAt: Date;
  assignedAgent?: { id: number; name: string } | null;
  answers?: Array<{ itemKey: string; confirmed: boolean; value: string | null; note: string | null }>;
}) {
  const raw = (row.customerSnapshot as CsQueueSnapshot | null) || null;
  const paymentState: CsPaymentState =
    raw?.paymentState ||
    resolvePaymentState({
      paymentMethod: raw?.paymentMethod,
      paymentMethodId: raw?.paymentMethodId,
      wooStatus: raw?.wooStatus || raw?.status,
      datePaid: raw?.datePaid,
    });
  const paidOnlineHighlight = paymentState === "paid";

  const shippingFromAnswer = row.answers?.find((a) => a.itemKey === "shipping_company")?.value;
  const shippingCompany = row.shippingCompany || shippingFromAnswer || "bosta";
  const trackingNumber =
    (row.trackingNumber && String(row.trackingNumber).trim()) ||
    (raw?.trackingNumber && String(raw.trackingNumber).trim()) ||
    null;

  const loc = resolveSnapshotLocation({
    governorate: raw?.governorate,
    area: raw?.area,
    address: raw?.address,
  });
  const addressOnly = loc.address || raw?.address || "";
  const govOk = Boolean(loc.governorate);
  const areaOk = Boolean(loc.area);

  return {
    id: row.id,
    wooOrderId: row.wooOrderId,
    wooOrderNumber: row.wooOrderNumber,
    status: row.status,
    shippingCompany,
    trackingNumber,
    waybillPrinted: Boolean(row.waybillPrinted),
    depositAmount: serializeDepositAmount(row.depositAmount),
    depositPaid: Boolean(row.depositPaid),
    depositPayMethod: normalizeDepositPayMethod(row.depositPayMethod),
    depositFromNumber: normalizeDepositFromNumber(row.depositFromNumber),
    depositToPhone: normalizeDepositToPhone(row.depositToPhone) || (row.depositToPhone ? String(row.depositToPhone).trim() || null : null),
    depositToMethod: normalizeDepositPayMethod(row.depositToMethod),
    depositPaidAt: row.depositPaidAt
      ? typeof row.depositPaidAt === "string"
        ? row.depositPaidAt
        : row.depositPaidAt.toISOString()
      : null,
    depositProofUrl: row.depositProofUrl ? String(row.depositProofUrl) : null,
    depositApprovalStatus: (() => {
      const s = String(row.depositApprovalStatus || "").trim().toLowerCase();
      if (s === "pending" || s === "approved" || s === "rejected") return s;
      return "none";
    })(),
    handedToCarrier: Boolean(row.handedToCarrier),
    handedToCarrierAt: row.handedToCarrierAt
      ? typeof row.handedToCarrierAt === "string"
        ? row.handedToCarrierAt
        : row.handedToCarrierAt.toISOString()
      : null,
    deliveredToCustomer: Boolean(row.deliveredToCustomer),
    customerFollowUp: Boolean(row.customerFollowUp),
    shippingAssignedAt: row.shippingAssignedAt
      ? typeof row.shippingAssignedAt === "string"
        ? row.shippingAssignedAt
        : row.shippingAssignedAt.toISOString()
      : null,
    courierAgentId: row.courierAgentId ?? null,
    courierOutcome: row.courierOutcome || null,
    courierRefusalReason: row.courierRefusalReason ? String(row.courierRefusalReason) : null,
    salesOrderNumber: row.salesOrderNumber ? String(row.salesOrderNumber) : null,
    invoiceNumber: row.invoiceNumber ? String(row.invoiceNumber) : null,
    bostaStatus: row.bostaStatus ? String(row.bostaStatus) : null,
    bostaShippingFee: row.bostaShippingFee == null ? null : Number(row.bostaShippingFee),
    assignedAgent: row.assignedAgent
      ? { id: row.assignedAgent.id, name: row.assignedAgent.name }
      : null,
    customerSnapshot: raw
      ? {
          customerName: raw.customerName,
          phone: raw.phone,
          address: addressOnly,
          // Empty when unresolved codes (EG / 25 / …) so UI can hide the columns
          area: areaOk ? loc.area : "",
          governorate: govOk ? loc.governorate : "",
          addressFull: [addressOnly, areaOk ? loc.area : "", govOk ? loc.governorate : ""]
            .filter(Boolean)
            .join(" — "),
          total: raw.total,
          dateCreated: raw.dateCreated,
          paymentMethod: raw.paymentMethod,
          paymentMethodId: raw.paymentMethodId || null,
          paymentState,
          datePaid: raw.datePaid || null,
          paidOnlineHighlight,
          wooStatus: raw.wooStatus || raw.status,
          trackingNumber,
          items: raw.items || [],
        }
      : null,
    startedAt: row.startedAt
      ? typeof row.startedAt === "string"
        ? row.startedAt
        : row.startedAt.toISOString()
      : null,
    confirmedAt: row.confirmedAt
      ? typeof row.confirmedAt === "string"
        ? row.confirmedAt
        : row.confirmedAt.toISOString()
      : null,
    confirmationEditedAt: row.confirmationEditedAt
      ? typeof row.confirmationEditedAt === "string"
        ? row.confirmationEditedAt
        : row.confirmationEditedAt.toISOString()
      : null,
    updatedAt: row.updatedAt
      ? typeof row.updatedAt === "string"
        ? row.updatedAt
        : row.updatedAt.toISOString()
      : null,
    distributedAt: row.distributedAt
      ? typeof row.distributedAt === "string"
        ? row.distributedAt
        : row.distributedAt.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Latest assignment createdAt whose range covers this order for its assigned agent. */
async function attachDistributedAt(
  rows: Array<{
    wooOrderNumber: string;
    assignedAgentId?: number | null;
    assignedAgent?: { id: number; name: string } | null;
    distributedAt?: string | null;
  }>,
) {
  const prisma = getPrismaClient();
  if (!prisma || rows.length === 0) return;
  const ranges = await prisma.csOrderAssignment.findMany({
    select: {
      agentId: true,
      wooOrderNumberFrom: true,
      wooOrderNumberTo: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  for (const row of rows) {
    const agentId = row.assignedAgentId || row.assignedAgent?.id || null;
    if (!agentId) {
      row.distributedAt = null;
      continue;
    }
    const n = parseWooOrderNumber(row.wooOrderNumber);
    if (!n) {
      row.distributedAt = null;
      continue;
    }
    const match = ranges.find((range) => {
      if (range.agentId !== agentId) return false;
      const from = Math.min(range.wooOrderNumberFrom, range.wooOrderNumberTo);
      const to = Math.max(range.wooOrderNumberFrom, range.wooOrderNumberTo);
      return n >= from && n <= to;
    });
    row.distributedAt = match ? match.createdAt.toISOString() : null;
  }
}

export async function getCsConfirmation(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await ensureCsTables();

  return prisma.csOrderConfirmation.findUnique({
    where: { id },
    include: { assignedAgent: true, answers: true },
  });
}

export async function startCsConfirmation(id: number, agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({ where: { id } });
  if (!row) return { ok: false as const, message: "الطلب غير موجود." };

  if (row.status === CS_CONFIRMATION_STATUS.CONFIRMED) {
    const confirmation = await getCsConfirmation(id);
    return { ok: true as const, confirmation: confirmation! };
  }

  const live = await getAdminOrder(String(row.wooOrderId));
  const tracking = await trackingMapForOrders([row.wooOrderId]);
  const snapshot = live
    ? snapshotFromOrder(live, tracking.get(row.wooOrderId))
    : row.customerSnapshot;

  const fresh = await prisma.csOrderConfirmation.findUnique({ where: { id } });
  if (!fresh) return { ok: false as const, message: "الطلب غير موجود." };
  if (
    fresh.status === CS_CONFIRMATION_STATUS.CONFIRMED ||
    fresh.status === CS_CONFIRMATION_STATUS.FAILED_CONTACT ||
    fresh.status === CS_CONFIRMATION_STATUS.CANCELLED
  ) {
    const confirmation = await getCsConfirmation(id);
    return { ok: true as const, confirmation: confirmation! };
  }

  const updated = await prisma.csOrderConfirmation.update({
    where: { id },
    data: {
      status: CS_CONFIRMATION_STATUS.IN_PROGRESS,
      assignedAgentId: agentId,
      startedAt: row.startedAt || new Date(),
      customerSnapshot: snapshot ?? undefined,
    },
    include: { answers: true, assignedAgent: true },
  });

  return { ok: true as const, confirmation: updated };
}

function waybillSnapshot(snapshot: Record<string, unknown>, answers: CsChecklistAnswerInput[]) {
  const text = (key: string) => {
    const item = answers.find((answer) => answer.itemKey === key);
    return String(item?.value || "").trim();
  };
  const next = { ...snapshot };
  const name = text("customer_name");
  const phone = text("primary_phone");
  const address = text("address_complete");
  const governorate = text("governorate_confirm");
  const area = text("area_confirm");
  if (name) next.customerName = name;
  if (phone) next.phone = phone;
  if (address) next.address = address;
  if (governorate) next.governorate = governorate;
  if (area) next.area = area;
  return next;
}

function shippingCompanyFromAnswers(answers: CsChecklistAnswerInput[]) {
  const item = answers.find((a) => a.itemKey === "shipping_company");
  const value = String(item?.value || "").trim();
  if (value === "bosta" || value === "sayed_temima") return value;
  return null;
}

async function persistChecklistAnswers(confirmationId: number, answers: CsChecklistAnswerInput[]) {
  const prisma = getPrismaClient();
  if (!prisma || !answers.length) return;
  const allKeys = new Set([
    ...CS_CHECKLIST_ITEMS.map((item) => item.key),
    ...CS_FOLLOWUP_ITEMS.map((item) => item.key),
  ]);
  for (const answer of answers) {
    if (!allKeys.has(answer.itemKey)) continue;
    await prisma.csChecklistAnswer.upsert({
      where: {
        confirmationId_itemKey: {
          confirmationId,
          itemKey: answer.itemKey,
        },
      },
      create: {
        confirmationId,
        itemKey: answer.itemKey,
        confirmed: Boolean(answer.confirmed),
        value: answer.value ?? (answer.yesNo ? answer.yesNo : null),
        note: answer.note ?? null,
      },
      update: {
        confirmed: Boolean(answer.confirmed),
        value: answer.value ?? (answer.yesNo ? answer.yesNo : null),
        note: answer.note ?? null,
      },
    });
  }
}

function bostaResultFields(state: Awaited<ReturnType<typeof syncCsBostaWaybill>> | null) {
  if (!state) return {};
  return {
    bostaMessage: state.message,
    trackingNumber: state.trackingNumber,
    bostaStatus: state.bostaStatus,
    bostaStatusLabel: state.bostaStatusLabel,
    bostaShippingFee: state.bostaShippingFee,
    bostaSyncedAt: state.bostaSyncedAt,
    bostaSyncError: state.bostaSyncError,
    cod: state.cod,
    lastEvent: state.lastEvent,
  };
}

async function pushBostaIfNeeded(input: {
  row: {
    id: number;
    wooOrderId: number;
    wooOrderNumber: string;
    customerSnapshot: unknown;
    shippingCompany?: string | null;
  };
  answers: CsChecklistAnswerInput[];
  shippingCompany: string | null;
  trackingNumber: string | null;
  bostaStatus: string | null;
  bostaShippingFee: number | null;
  allowCreate: boolean;
}) {
  if (input.shippingCompany !== "bosta") return null;
  if (!input.allowCreate && !input.trackingNumber) return null;
  return syncCsBostaWaybill({
    confirmationId: input.row.id,
    wooOrderId: input.row.wooOrderId,
    wooOrderNumber: input.row.wooOrderNumber,
    shippingCompany: input.shippingCompany,
    trackingNumber: input.trackingNumber,
    bostaStatus: input.bostaStatus,
    bostaShippingFee: input.bostaShippingFee,
    answers: input.answers,
    snapshot: (input.row.customerSnapshot as Record<string, unknown> | null) || null,
  });
}

export async function saveCsConfirmation(input: {
  id: number;
  agentId: number;
  answers: CsChecklistAnswerInput[];
  finalize: boolean;
  failContact?: boolean;
  cancelOrder?: boolean;
  failReason?: string;
  trackingNumber?: string | null;
  waybillPrinted?: boolean;
  depositAmount?: number | string | null;
  depositPaid?: boolean;
  depositPayMethod?: string | null;
  depositFromNumber?: string | null;
  depositInstapayName?: string | null;
  depositToPhone?: string | null;
  depositToMethod?: string | null;
  orderTotalDelta?: number | string | null;
  salesOrderNumber?: string | null;
  postCancel?: {
    invoice?: "before" | "after" | "";
    systemNo?: string | null;
    refundPaid?: boolean;
  };
  followUp?: {
    handedToCarrier?: boolean;
    deliveredToCustomer?: boolean;
    customerFollowUp?: boolean;
  };
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة.", missing: [] as string[] };
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: input.id },
    include: { answers: true },
  });
  if (!row) return { ok: false as const, message: "الطلب غير موجود.", missing: [] };

  const snap = ((row.customerSnapshot as Record<string, unknown> | null) || {}) as Record<string, unknown>;
  const typed = row as {
    trackingNumber?: string | null;
    waybillPrinted?: boolean | null;
    depositAmount?: unknown;
    depositPaid?: boolean | null;
    depositPayMethod?: string | null;
    depositFromNumber?: string | null;
    depositInstapayName?: string | null;
    depositToPhone?: string | null;
    depositToMethod?: string | null;
    postCancelAt?: Date | null;
    handedToCarrier?: boolean | null;
    bostaStatus?: string | null;
    bostaShippingFee?: unknown;
  };
  const nextTracking =
    input.trackingNumber !== undefined
      ? String(input.trackingNumber || "").trim() || null
      : (typed.trackingNumber ?? null);
  const nextWaybill =
    input.waybillPrinted !== undefined ? Boolean(input.waybillPrinted) : Boolean(typed.waybillPrinted);
  const nextDepositAmount =
    input.depositAmount !== undefined
      ? parseDepositAmount(input.depositAmount)
      : parseDepositAmount(typed.depositAmount);
  const nextDepositPaid =
    input.depositPaid !== undefined ? Boolean(input.depositPaid) : Boolean(typed.depositPaid);
  const nextDepositPayMethod =
    input.depositPayMethod !== undefined
      ? normalizeDepositPayMethod(input.depositPayMethod)
      : normalizeDepositPayMethod(typed.depositPayMethod);
  const nextDepositFromNumber =
    input.depositFromNumber !== undefined
      ? normalizeDepositFromNumber(input.depositFromNumber)
      : normalizeDepositFromNumber(typed.depositFromNumber);
  const nextDepositInstapayName =
    nextDepositPayMethod === "instapay"
      ? input.depositInstapayName !== undefined
        ? normalizeDepositInstapayName(input.depositInstapayName)
        : normalizeDepositInstapayName(typed.depositInstapayName)
      : null;
  const nextDepositToPhone =
    input.depositToPhone !== undefined
      ? normalizeDepositToPhone(input.depositToPhone)
      : normalizeDepositToPhone(typed.depositToPhone);
  const nextDepositToMethod =
    input.depositToMethod !== undefined
      ? normalizeDepositPayMethod(input.depositToMethod)
      : normalizeDepositPayMethod(typed.depositToMethod);

  const shippingMetaPatch: {
    trackingNumber?: string | null;
    waybillPrinted?: boolean;
    depositAmount?: number | null;
    depositPaid?: boolean;
    depositPayMethod?: string | null;
    depositFromNumber?: string | null;
    depositInstapayName?: string | null;
    depositToPhone?: string | null;
    depositToMethod?: string | null;
    orderTotalDelta?: unknown;
    customerSnapshot?: Record<string, unknown>;
  } = {};
  if (input.trackingNumber !== undefined) {
    shippingMetaPatch.trackingNumber = nextTracking;
    shippingMetaPatch.customerSnapshot = { ...snap, trackingNumber: nextTracking };
  }
  if (input.waybillPrinted !== undefined) {
    shippingMetaPatch.waybillPrinted = nextWaybill;
  }
  if (input.depositAmount !== undefined) {
    shippingMetaPatch.depositAmount = nextDepositAmount;
  }
  if (input.depositPaid !== undefined) {
    shippingMetaPatch.depositPaid = nextDepositPaid;
  }
  if (input.depositPayMethod !== undefined) {
    shippingMetaPatch.depositPayMethod = nextDepositPayMethod;
  }
  if (input.depositFromNumber !== undefined) {
    shippingMetaPatch.depositFromNumber = nextDepositFromNumber;
  }
  if (input.depositInstapayName !== undefined || input.depositPayMethod !== undefined) {
    shippingMetaPatch.depositInstapayName = nextDepositInstapayName;
  }
  if (input.depositToPhone !== undefined) {
    shippingMetaPatch.depositToPhone = nextDepositToPhone;
  }
  if (input.depositToMethod !== undefined) {
    shippingMetaPatch.depositToMethod = nextDepositToMethod;
  }
  if (input.orderTotalDelta !== undefined) {
    shippingMetaPatch.orderTotalDelta = parseOrderTotalDelta(input.orderTotalDelta);
  }

  const salesOrderPatch =
    input.salesOrderNumber !== undefined
      ? { salesOrderNumber: String(input.salesOrderNumber || "").trim() || null }
      : {};

  const hasShippingMetaUpdate =
    input.trackingNumber !== undefined ||
    input.waybillPrinted !== undefined ||
    input.depositAmount !== undefined ||
    input.depositPaid !== undefined ||
    input.depositPayMethod !== undefined ||
    input.depositFromNumber !== undefined ||
    input.depositInstapayName !== undefined ||
    input.depositToPhone !== undefined ||
    input.depositToMethod !== undefined ||
    input.orderTotalDelta !== undefined;

  const followUpEditable =
    row.status === CS_CONFIRMATION_STATUS.CONFIRMED || Boolean(typed.postCancelAt);

  // Post-confirmation follow-up update (includes tracking / waybill / deposit / cancel / sales order)
  if (
    followUpEditable &&
    (input.followUp || hasShippingMetaUpdate || input.salesOrderNumber !== undefined || input.postCancel)
  ) {
    const now = new Date();
    const data: Record<string, unknown> = { ...shippingMetaPatch };
    if (row.status === CS_CONFIRMATION_STATUS.CONFIRMED) {
      if (row.confirmedAt) data.confirmationEditedAt = now;
      else data.confirmedAt = now;
    }
    if (input.followUp) {
      data.handedToCarrier = Boolean(input.followUp.handedToCarrier);
      data.deliveredToCustomer = Boolean(input.followUp.deliveredToCustomer);
      data.customerFollowUp = Boolean(input.followUp.customerFollowUp);
      if (input.followUp.handedToCarrier) {
        const cutoffs = await listTemimaCutoffs();
        data.handedToCarrierAt = resolveHandedToCarrierAt(row.handedToCarrierAt, row.confirmedAt, now, cutoffs);
      }
      data.deliveredToCustomerAt = input.followUp.deliveredToCustomer ? now : null;
      data.customerFollowUpAt = input.followUp.customerFollowUp ? now : null;
    }
    Object.assign(data, salesOrderPatch);
    const post = input.postCancel;
    if (post?.refundPaid) {
      const invoice = post.invoice === "after" ? "after" : post.invoice === "before" ? "before" : "";
      if (!invoice) {
        return { ok: false as const, message: "حدّد الإلغاء قبل الفاتورة أو بعد الفاتورة.", missing: [] as string[] };
      }
      const systemNo = String(post.systemNo || "").trim();
      if (invoice === "after" && !systemNo) {
        return { ok: false as const, message: "اكتب رقم الإلغاء على السيستم.", missing: [] as string[] };
      }
      const handingOver = input.followUp
        ? Boolean(input.followUp.handedToCarrier)
        : Boolean(typed.handedToCarrier);
      if (handingOver) {
        return { ok: false as const, message: "لا يمكن الإلغاء بعد التسليم لشركة الشحن.", missing: [] as string[] };
      }
      data.status = CS_CONFIRMATION_STATUS.CANCELLED;
      data.postCancelInvoice = invoice;
      data.postCancelSystemNo = invoice === "after" ? systemNo : null;
      data.postCancelRefundPaid = true;
      data.postCancelAt = now;
      data.failReason = "الغاء بعد التأكيد";
    }
    const followAnswers = input.answers?.length ? input.answers : row.answers;
    const followSnapshot = post?.refundPaid
      ? { ...snap, ...((data.customerSnapshot as Record<string, unknown> | undefined) || {}) }
      : waybillSnapshot(
          { ...snap, ...((data.customerSnapshot as Record<string, unknown> | undefined) || {}) },
          followAnswers,
        );
    if (!post?.refundPaid) data.customerSnapshot = followSnapshot;
    await prisma.csOrderConfirmation.update({
      where: { id: input.id },
      data: data as never,
    });
    if (input.answers?.length && !post?.refundPaid) {
      await persistChecklistAnswers(input.id, input.answers);
    }
    const followFee = typed.bostaShippingFee == null ? null : Number(typed.bostaShippingFee);
    const bosta = post?.refundPaid
      ? null
      : await pushBostaIfNeeded({
          row: { ...row, customerSnapshot: followSnapshot },
          answers: followAnswers,
          shippingCompany: row.shippingCompany,
          trackingNumber: nextTracking,
          bostaStatus: typed.bostaStatus || null,
          bostaShippingFee: Number.isFinite(followFee) ? followFee : null,
          allowCreate: true,
        });
    return {
      ok: true as const,
      status: post?.refundPaid ? CS_CONFIRMATION_STATUS.CANCELLED : CS_CONFIRMATION_STATUS.CONFIRMED,
      missing: [] as string[],
      ...bostaResultFields(bosta),
    };
  }

  // Allow saving tracking / waybill / deposit alone (no checklist payload)
  if (
    !input.finalize &&
    !input.failContact &&
    !input.cancelOrder &&
    !input.followUp &&
    (!input.answers || input.answers.length === 0) &&
    hasShippingMetaUpdate &&
    Object.keys(shippingMetaPatch).length > 0
  ) {
    await prisma.csOrderConfirmation.update({
      where: { id: input.id },
      data: {
        ...shippingMetaPatch,
        ...salesOrderPatch,
        assignedAgentId: input.agentId,
      } as never,
    });
    return { ok: true as const, status: row.status, missing: [] as string[] };
  }

  if (input.failContact) {
    await prisma.csOrderConfirmation.update({
      where: { id: input.id },
      data: {
        status: CS_CONFIRMATION_STATUS.FAILED_CONTACT,
        failReason: input.failReason?.trim() || "لم يرد",
        assignedAgentId: input.agentId,
      },
    });
    return { ok: true as const, status: CS_CONFIRMATION_STATUS.FAILED_CONTACT, missing: [] as string[] };
  }

  if (input.cancelOrder) {
    await prisma.csOrderConfirmation.update({
      where: { id: input.id },
      data: {
        status: CS_CONFIRMATION_STATUS.CANCELLED,
        failReason: input.failReason?.trim() || "لاغى",
        assignedAgentId: input.agentId,
      },
    });
    return { ok: true as const, status: CS_CONFIRMATION_STATUS.CANCELLED, missing: [] as string[] };
  }

  await persistChecklistAnswers(input.id, input.answers);

  const shippingFromRow =
    row.shippingCompany === "bosta" || row.shippingCompany === "sayed_temima"
      ? row.shippingCompany
      : null;
  const shippingCompany = shippingFromRow || shippingCompanyFromAnswers(input.answers);

  if (!input.finalize) {
    await prisma.csOrderConfirmation.update({
      where: { id: input.id },
      data: {
        status: CS_CONFIRMATION_STATUS.IN_PROGRESS,
        assignedAgentId: input.agentId,
        ...shippingMetaPatch,
        ...salesOrderPatch,
      } as never,
    });
    const draftFee = typed.bostaShippingFee == null ? null : Number(typed.bostaShippingFee);
    const draftBosta = await pushBostaIfNeeded({
      row,
      answers: input.answers,
      shippingCompany,
      trackingNumber: nextTracking,
      bostaStatus: typed.bostaStatus || null,
      bostaShippingFee: Number.isFinite(draftFee) ? draftFee : null,
      allowCreate: false,
    });
    return {
      ok: true as const,
      status: CS_CONFIRMATION_STATUS.IN_PROGRESS,
      missing: [] as string[],
      ...bostaResultFields(draftBosta),
    };
  }

  // Ensure shipping_company answer is present for validation when supervisor already set it
  const answersForValidation = [...input.answers];
  if (shippingFromRow) {
    const idx = answersForValidation.findIndex((a) => a.itemKey === "shipping_company");
    const filled = {
      itemKey: "shipping_company",
      confirmed: true,
      value: shippingFromRow,
      note: null as string | null,
      yesNo: null as "yes" | "no" | null,
    };
    if (idx >= 0) answersForValidation[idx] = { ...answersForValidation[idx], ...filled };
    else answersForValidation.push(filled);
  }

  const validation = validateChecklistAnswers(answersForValidation);
  if (!validation.ok) {
    return {
      ok: false as const,
      message: "استكمل كل البنود الإلزامية قبل الحفظ النهائي.",
      missing: validation.missing,
    };
  }

  if (!shippingCompany) {
    return {
      ok: false as const,
      message: "يجب أن تحدد المشرفة شركة الشحن أولاً من قائمة الأوردرات.",
      missing: ["shipping_company"],
    };
  }

  const alreadySaved = row.status === CS_CONFIRMATION_STATUS.CONFIRMED && Boolean(row.confirmedAt);
  const savedAt = new Date();
  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: {
      status: CS_CONFIRMATION_STATUS.CONFIRMED,
      ...(alreadySaved ? { confirmationEditedAt: savedAt } : { confirmedAt: savedAt }),
      assignedAgentId: input.agentId,
      shippingCompany,
      failReason: null,
      ...shippingMetaPatch,
      ...salesOrderPatch,
    } as never,
  });

  const savedFee = typed.bostaShippingFee == null ? null : Number(typed.bostaShippingFee);
  const bosta = await pushBostaIfNeeded({
    row: { ...row, shippingCompany },
    answers: input.answers,
    shippingCompany,
    trackingNumber: nextTracking,
    bostaStatus: typed.bostaStatus || null,
    bostaShippingFee: Number.isFinite(savedFee) ? savedFee : null,
    allowCreate: true,
  });

  return {
    ok: true as const,
    status: CS_CONFIRMATION_STATUS.CONFIRMED,
    missing: [] as string[],
    ...bostaResultFields(bosta),
  };
}

export async function setCsInvoiceNumber(input: { id: number; invoiceNumber: string | null; agentId: number }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const viewer = await resolveCsViewer(input.agentId);
  if (!viewer.isAccounting && !viewer.isSupervisor && !viewer.isAdmin) {
    return { ok: false as const, message: "للمشرفة أو الحسابات فقط." };
  }

  const row = await prisma.csOrderConfirmation.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false as const, message: "الطلب غير موجود." };

  const invoiceNumber = String(input.invoiceNumber || "").replace(/\D/g, "").slice(0, 10) || null;
  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: { invoiceNumber } as never,
  });
  return { ok: true as const, invoiceNumber };
}

export async function setCsShippingCompany(input: {
  id: number;
  shippingCompany: "bosta" | "sayed_temima" | null;
  agentId: number;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const viewer = await resolveCsViewer(input.agentId);
  if (!viewer.isSupervisor) {
    return { ok: false as const, message: "للمشرفة فقط." };
  }

  const row = await prisma.csOrderConfirmation.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false as const, message: "الطلب غير موجود." };

  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: {
      shippingCompany: input.shippingCompany,
      ...(row.shippingCompany !== input.shippingCompany
        ? { shippingAssignedAt: input.shippingCompany ? new Date() : null }
        : {}),
    },
  });

  if (input.shippingCompany) {
    await prisma.csChecklistAnswer.upsert({
      where: {
        confirmationId_itemKey: {
          confirmationId: input.id,
          itemKey: "shipping_company",
        },
      },
      create: {
        confirmationId: input.id,
        itemKey: "shipping_company",
        confirmed: true,
        value: input.shippingCompany,
      },
      update: {
        confirmed: true,
        value: input.shippingCompany,
      },
    });
  }

  if (input.shippingCompany === "sayed_temima" && !String(row.trackingNumber || "").trim()) {
    await attachBostaWaybillByOrderReference({
      confirmationId: row.id,
      wooOrderId: row.wooOrderId,
      wooOrderNumber: row.wooOrderNumber,
      snapshot: (row.customerSnapshot as Record<string, unknown> | null) || null,
      onlyIfFound: true,
    });
  }

  return { ok: true as const, shippingCompany: input.shippingCompany };
}

export async function isOrderCsConfirmed(wooOrderId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return false;
  await ensureCsTables();
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { wooOrderId },
    select: { status: true },
  });
  if (!row) return true;
  return row.status === CS_CONFIRMATION_STATUS.CONFIRMED;
}

export async function resolveCsViewer(agentId: number) {
  const { getCsAgentById, csFlagsFromRoles, parseCsRoles } = await import("@/lib/cs/agents");
  await ensureCsTables();
  const agent = await getCsAgentById(agentId);
  if (!agent) {
    return {
      isSupervisor: false,
      isAdmin: false,
      isTransfers: false,
      isShipping: false,
      isAccounting: false,
      canAccessTransfers: false,
      canSeeOrders: true,
      isCourierSupervisor: false,
      isCourier: false,
      role: "agent" as const,
      roles: ["agent"] as const,
      agent: null,
    };
  }
  const flags = csFlagsFromRoles(
    parseCsRoles(agent as { role?: string; roles?: string | string[] | null; isSupervisor?: boolean; username?: string }),
  );
  return {
    ...flags,
    agent,
  };
}
