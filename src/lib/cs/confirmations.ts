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
import { attachBostaWaybillByOrderReference, syncCsBostaWaybill } from "@/lib/cs/bosta-waybill";
import {
  parseWooOrderNumber,
} from "@/lib/cs/assignments";
import {
  getCairoYesterdayStartDateString,
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

export function normalizeDepositToPhone(value: unknown): string | null {
  const s = String(value || "").trim();
  if ((CS_DEPOSIT_COMPANY_PHONES as readonly string[]).includes(s)) return s;
  return null;
}

export async function syncRecentOrdersForCs(options?: { perPage?: number }) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة.", imported: 0 };
  }

  await ensureCsTables();

  const after = getCairoYesterdayStartDateString();
  const result = await getAdminOrders({
    perPage: String(options?.perPage || 100),
    page: "1",
    status: "processing,on-hold,pending",
    after,
  });

  if (result.error) {
    return { ok: false as const, message: result.error, imported: 0 };
  }

  const windowOrders = result.orders.filter((order) =>
    isWithinCairoTodayOrYesterday(order.dateCreated),
  );
  const tracking = await trackingMapForOrders(windowOrders.map((o) => o.id));

  // Enrich gov/area from Shipment rows when Woo snapshot is incomplete
  const shipmentByWoo = new Map<number, { governorate: string; area: string }>();
  try {
    const ships = await getShipmentsByOrderIds(windowOrders.map((o) => o.id));
    for (const [wooId, ship] of ships) {
      if (ship?.governorate || ship?.area) {
        shipmentByWoo.set(wooId, {
          governorate: ship.governorate || "",
          area: ship.area || "",
        });
      }
    }
  } catch {
    // shipping tables optional
  }

  let imported = 0;
  for (const order of windowOrders) {
    const snap = snapshotFromOrder(order, tracking.get(order.id)) as CsQueueSnapshot & {
      governorate?: string;
      area?: string;
    };
    const fromShip = shipmentByWoo.get(order.id);
    if (fromShip) {
      const govBad =
        !snap.governorate ||
        snap.governorate === "غير محدد" ||
        looksLikeLocationCode(snap.governorate);
      const areaBad =
        !snap.area || snap.area === "غير محدد" || looksLikeLocationCode(snap.area);
      if (govBad && fromShip.governorate && !looksLikeLocationCode(fromShip.governorate)) {
        snap.governorate = fromShip.governorate;
      }
      if (areaBad && fromShip.area && !looksLikeLocationCode(fromShip.area)) {
        snap.area = fromShip.area;
      }
    }

    const existing = await prisma.csOrderConfirmation.findUnique({
      where: { wooOrderId: order.id },
    });
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

  // Refresh snapshots for existing CS rows that still show codes / missing area
  const existingRows = await prisma.csOrderConfirmation.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  for (const row of existingRows) {
    const snap = row.customerSnapshot as CsQueueSnapshot | null;
    if (!snap) continue;
    const needs =
      looksLikeLocationCode(snap.governorate || "") ||
      !snap.area ||
      snap.area === "غير محدد" ||
      looksLikeLocationCode(snap.area || "");
    if (!needs) continue;
    if (windowOrders.some((o) => o.id === row.wooOrderId)) continue; // already refreshed above

    const live = await getAdminOrder(String(row.wooOrderId));
    if (!live) {
      // Still normalize codes on existing snapshot
      const fixed = resolveSnapshotLocation({
        governorate: snap.governorate,
        area: snap.area,
        address: snap.address,
      });
      if (fixed.governorate !== snap.governorate || fixed.area !== snap.area) {
        await prisma.csOrderConfirmation.update({
          where: { id: row.id },
          data: {
            customerSnapshot: { ...snap, governorate: fixed.governorate, area: fixed.area, address: fixed.address },
          },
        });
      }
      continue;
    }
    const trackingOne = await trackingMapForOrders([live.id]);
    const next = snapshotFromOrder(live, trackingOne.get(live.id)) as CsQueueSnapshot;
    try {
      const ships = await getShipmentsByOrderIds([live.id]);
      const fromShip = ships.get(live.id);
      if (fromShip) {
        if (looksLikeLocationCode(next.governorate || "") || next.governorate === "غير محدد") {
          if (fromShip.governorate) next.governorate = fromShip.governorate;
        }
        if (!next.area || next.area === "غير محدد") {
          if (fromShip.area) next.area = fromShip.area;
        }
      }
    } catch {
      // optional
    }
    await prisma.csOrderConfirmation.update({
      where: { id: row.id },
      data: { customerSnapshot: next, wooOrderNumber: live.number },
    });
  }

  await linkMissingBostaWaybills(prisma, windowOrders);

  return { ok: true as const, imported, totalFetched: windowOrders.length };
}

async function linkMissingBostaWaybills(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  orders: AdminOrder[],
) {
  const missing = await prisma.csOrderConfirmation.findMany({
    where: {
      AND: [
        { OR: [{ trackingNumber: null }, { trackingNumber: "" }] },
        { OR: [{ shippingCompany: "bosta" }, { shippingCompany: null }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const trackingByOrder = new Map(orders.map((order) => [order.id, order.bostaTrackingNumber || ""]));
  for (const row of missing) {
    if (String(row.trackingNumber || "").trim()) continue;
    if (row.shippingCompany === "sayed_temima") continue;
    const snap = (row.customerSnapshot as { trackingNumber?: string | null } | null) || null;
    await attachBostaWaybillByOrderReference({
      confirmationId: row.id,
      wooOrderId: row.wooOrderId,
      wooOrderNumber: row.wooOrderNumber,
      snapshot: (row.customerSnapshot as Record<string, unknown> | null) || null,
      knownTracking: trackingByOrder.get(row.wooOrderId) || snap?.trackingNumber || null,
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
  if (!String(saved.trackingNumber || "").trim() && saved.shippingCompany !== "sayed_temima") {
    await attachBostaWaybillByOrderReference({
      confirmationId: saved.id,
      wooOrderId: saved.wooOrderId,
      wooOrderNumber: saved.wooOrderNumber,
      snapshot: (saved.customerSnapshot as Record<string, unknown> | null) || null,
      knownTracking: order.bostaTrackingNumber || null,
    });
  }
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
    rows = (await prisma.csOrderConfirmation.findMany({
      include: { assignedAgent: true, answers: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    })) as Row[];
  } catch (error) {
    console.error("[cs] listCsConfirmationsForViewer failed, retry after migrate:", error);
    await ensureCsTables();
    try {
      rows = (await prisma.csOrderConfirmation.findMany({
        include: { assignedAgent: true, answers: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      })) as Row[];
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
         FROM \`CsOrderConfirmation\` ORDER BY \`createdAt\` DESC LIMIT 500`,
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

  const inWindow = rows.filter((row) => {
    const distributedAt = (row as { distributedAt?: string | null }).distributedAt;
    if (distributedAt && isWithinCairoLastDays(distributedAt, 30)) return true;
    const snap = row.customerSnapshot as { dateCreated?: string } | null;
    if (isWithinCairoLastDays(snap?.dateCreated, 30)) return true;
    const workIso = [
      row.confirmedAt instanceof Date ? row.confirmedAt.toISOString() : row.confirmedAt,
      row.startedAt instanceof Date ? row.startedAt.toISOString() : row.startedAt,
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    ];
    return workIso.some((iso) => typeof iso === "string" && isWithinCairoLastDays(iso, 30));
  });

  if (opts.isSupervisor || opts.seeAll) {
    return sortByOrderNumberDesc(inWindow);
  }

  // Regular agents: only orders explicitly distributed to them by a supervisor.
  const filtered = inWindow.filter((row) => row.assignedAgentId === opts.agentId);

  return sortByOrderNumberDesc(filtered);
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
  deliveredToCustomer?: boolean | null;
  customerFollowUp?: boolean | null;
  salesOrderNumber?: string | null;
    invoiceNumber?: string | null;
  bostaStatus?: string | null;
  bostaShippingFee?: unknown;
  customerSnapshot?: unknown;
  startedAt?: Date | string | null;
  confirmedAt?: Date | string | null;
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
    deliveredToCustomer: Boolean(row.deliveredToCustomer),
    customerFollowUp: Boolean(row.customerFollowUp),
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
  depositToPhone?: string | null;
  depositToMethod?: string | null;
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
    depositToPhone?: string | null;
    depositToMethod?: string | null;
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
  if (input.depositToPhone !== undefined) {
    shippingMetaPatch.depositToPhone = nextDepositToPhone;
  }
  if (input.depositToMethod !== undefined) {
    shippingMetaPatch.depositToMethod = nextDepositToMethod;
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
    input.depositToPhone !== undefined ||
    input.depositToMethod !== undefined;

  const followUpEditable =
    row.status === CS_CONFIRMATION_STATUS.CONFIRMED || Boolean(typed.postCancelAt);

  // Post-confirmation follow-up update (includes tracking / waybill / deposit / cancel / sales order)
  if (
    followUpEditable &&
    (input.followUp || hasShippingMetaUpdate || input.salesOrderNumber !== undefined || input.postCancel)
  ) {
    const now = new Date();
    const data: Record<string, unknown> = { ...shippingMetaPatch };
    if (input.followUp) {
      data.handedToCarrier = Boolean(input.followUp.handedToCarrier);
      data.deliveredToCustomer = Boolean(input.followUp.deliveredToCustomer);
      data.customerFollowUp = Boolean(input.followUp.customerFollowUp);
      data.handedToCarrierAt = input.followUp.handedToCarrier ? now : null;
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

  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: {
      status: CS_CONFIRMATION_STATUS.CONFIRMED,
      confirmedAt: new Date(),
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
  if (!viewer.isAccounting) {
    return { ok: false as const, message: "لموظف الحسابات فقط." };
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
