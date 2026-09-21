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
import {
  getAssignmentRangesForAgent,
  orderNumberInRanges,
  parseWooOrderNumber,
} from "@/lib/cs/assignments";
import {
  getCairoYesterdayStartDateString,
  isPaidOnlineHighlight,
  isWithinCairoTodayOrYesterday,
} from "@/lib/cs/order-window";
import { getShipmentsByOrderIds } from "@/lib/shipping/shipments";

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
    total: order.total,
    currency: order.currency,
    dateCreated: order.dateCreated,
    paidOnlineHighlight: isPaidOnlineHighlight(order.paymentMethod, order.paymentMethodId),
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

  let imported = 0;
  for (const order of windowOrders) {
    const snap = snapshotFromOrder(order, tracking.get(order.id));
    const existing = await prisma.csOrderConfirmation.findUnique({
      where: { wooOrderId: order.id },
    });
    if (existing) {
      await prisma.csOrderConfirmation.update({
        where: { id: existing.id },
        data: {
          wooOrderNumber: order.number,
          customerSnapshot: snap,
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
      },
    });
    imported += 1;
  }

  return { ok: true as const, imported, totalFetched: windowOrders.length };
}

export async function enqueueOrderFromWebhook(order: AdminOrder) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await ensureCsTables();
  const tracking = await trackingMapForOrders([order.id]);

  await prisma.csOrderConfirmation.upsert({
    where: { wooOrderId: order.id },
    create: {
      wooOrderId: order.id,
      wooOrderNumber: order.number,
      status: CS_CONFIRMATION_STATUS.PENDING,
      customerSnapshot: snapshotFromOrder(order, tracking.get(order.id)),
    },
    update: {
      wooOrderNumber: order.number,
      customerSnapshot: snapshotFromOrder(order, tracking.get(order.id)),
    },
  });
}

export async function listCsConfirmationsForViewer(opts: {
  agentId: number;
  isSupervisor: boolean;
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
      take: 300,
    })) as Row[];
  } catch (error) {
    console.error("[cs] listCsConfirmationsForViewer failed, retry after migrate:", error);
    await ensureCsTables();
    try {
      rows = (await prisma.csOrderConfirmation.findMany({
        include: { assignedAgent: true, answers: true },
        orderBy: { createdAt: "desc" },
        take: 300,
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
         FROM \`CsOrderConfirmation\` ORDER BY \`createdAt\` DESC LIMIT 300`,
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

  const inWindow = rows.filter((row) => {
    const snap = row.customerSnapshot as { dateCreated?: string } | null;
    return isWithinCairoTodayOrYesterday(snap?.dateCreated);
  });

  if (opts.isSupervisor) {
    return sortByOrderNumberDesc(inWindow);
  }

  let ranges: Array<{ from: number; to: number }> = [];
  try {
    ranges = await getAssignmentRangesForAgent(opts.agentId);
  } catch (error) {
    console.error("[cs] getAssignmentRangesForAgent failed:", error);
  }

  const filtered = inWindow.filter((row) => {
    if (
      row.status === CS_CONFIRMATION_STATUS.CONFIRMED ||
      row.status === CS_CONFIRMATION_STATUS.FAILED_CONTACT
    ) {
      return row.assignedAgentId === opts.agentId;
    }
    return orderNumberInRanges(row.wooOrderNumber, ranges);
  });

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
  handedToCarrier?: boolean | null;
  deliveredToCustomer?: boolean | null;
  customerFollowUp?: boolean | null;
  customerSnapshot?: unknown;
  createdAt: Date;
  assignedAgent?: { id: number; name: string } | null;
  answers?: Array<{ itemKey: string; confirmed: boolean; value: string | null; note: string | null }>;
}) {
  const raw = (row.customerSnapshot as CsQueueSnapshot | null) || null;
  const paidOnlineHighlight =
    raw?.paidOnlineHighlight ??
    isPaidOnlineHighlight(raw?.paymentMethod || "", raw?.paymentMethodId);

  const shippingFromAnswer = row.answers?.find((a) => a.itemKey === "shipping_company")?.value;
  const shippingCompany = row.shippingCompany || shippingFromAnswer || null;

  return {
    id: row.id,
    wooOrderId: row.wooOrderId,
    wooOrderNumber: row.wooOrderNumber,
    status: row.status,
    shippingCompany,
    handedToCarrier: Boolean(row.handedToCarrier),
    deliveredToCustomer: Boolean(row.deliveredToCustomer),
    customerFollowUp: Boolean(row.customerFollowUp),
    assignedAgent: row.assignedAgent
      ? { id: row.assignedAgent.id, name: row.assignedAgent.name }
      : null,
    customerSnapshot: raw
      ? {
          customerName: raw.customerName,
          phone: raw.phone,
          address: [raw.address, raw.area, raw.governorate].filter(Boolean).join(" — "),
          total: raw.total,
          dateCreated: raw.dateCreated,
          paymentMethod: raw.paymentMethod,
          paidOnlineHighlight,
          wooStatus: raw.wooStatus || raw.status,
          trackingNumber: raw.trackingNumber || null,
          items: raw.items || [],
        }
      : null,
    createdAt: row.createdAt.toISOString(),
  };
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

function shippingCompanyFromAnswers(answers: CsChecklistAnswerInput[]) {
  const item = answers.find((a) => a.itemKey === "shipping_company");
  const value = String(item?.value || "").trim();
  if (value === "bosta" || value === "sayed_temima") return value;
  return null;
}

export async function saveCsConfirmation(input: {
  id: number;
  agentId: number;
  answers: CsChecklistAnswerInput[];
  finalize: boolean;
  failContact?: boolean;
  failReason?: string;
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

  // Post-confirmation follow-up update
  if (row.status === CS_CONFIRMATION_STATUS.CONFIRMED && input.followUp) {
    const now = new Date();
    await prisma.csOrderConfirmation.update({
      where: { id: input.id },
      data: {
        handedToCarrier: Boolean(input.followUp.handedToCarrier),
        deliveredToCustomer: Boolean(input.followUp.deliveredToCustomer),
        customerFollowUp: Boolean(input.followUp.customerFollowUp),
        handedToCarrierAt: input.followUp.handedToCarrier ? now : null,
        deliveredToCustomerAt: input.followUp.deliveredToCustomer ? now : null,
        customerFollowUpAt: input.followUp.customerFollowUp ? now : null,
      },
    });
    return { ok: true as const, status: CS_CONFIRMATION_STATUS.CONFIRMED, missing: [] as string[] };
  }

  if (input.failContact) {
    await prisma.csOrderConfirmation.update({
      where: { id: input.id },
      data: {
        status: CS_CONFIRMATION_STATUS.FAILED_CONTACT,
        failReason: input.failReason?.trim() || "تعذر التواصل",
        assignedAgentId: input.agentId,
      },
    });
    return { ok: true as const, status: CS_CONFIRMATION_STATUS.FAILED_CONTACT, missing: [] as string[] };
  }

  const allKeys = new Set([
    ...CS_CHECKLIST_ITEMS.map((i) => i.key),
    ...CS_FOLLOWUP_ITEMS.map((i) => i.key),
  ]);

  for (const answer of input.answers) {
    if (!allKeys.has(answer.itemKey)) continue;
    await prisma.csChecklistAnswer.upsert({
      where: {
        confirmationId_itemKey: {
          confirmationId: input.id,
          itemKey: answer.itemKey,
        },
      },
      create: {
        confirmationId: input.id,
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

  const shippingCompany = shippingCompanyFromAnswers(input.answers);

  if (!input.finalize) {
    await prisma.csOrderConfirmation.update({
      where: { id: input.id },
      data: {
        status: CS_CONFIRMATION_STATUS.IN_PROGRESS,
        assignedAgentId: input.agentId,
        ...(shippingCompany ? { shippingCompany } : {}),
      },
    });
    return { ok: true as const, status: CS_CONFIRMATION_STATUS.IN_PROGRESS, missing: [] as string[] };
  }

  const validation = validateChecklistAnswers(input.answers);
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
      message: "اختاري شركة الشحن (بوسطة أو سيد تميمة).",
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
    },
  });

  return { ok: true as const, status: CS_CONFIRMATION_STATUS.CONFIRMED, missing: [] as string[] };
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
  const prisma = getPrismaClient();
  if (!prisma) return { isSupervisor: false };
  await ensureCsTables();
  const agent = await prisma.csAgent.findUnique({ where: { id: agentId } });
  if (!agent) return { isSupervisor: false };
  const { isSupervisorAgent } = await import("@/lib/cs/agents");
  return { isSupervisor: isSupervisorAgent(agent), agent };
}
