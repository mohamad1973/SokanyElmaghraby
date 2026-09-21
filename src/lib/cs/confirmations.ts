import "server-only";

import type { AdminOrder } from "@/lib/orders";
import { getAdminOrder, getAdminOrders } from "@/lib/orders";
import { getPrismaClient } from "@/lib/db";
import {
  CS_CHECKLIST_ITEMS,
  CS_CONFIRMATION_STATUS,
  type CsChecklistAnswerInput,
  validateChecklistAnswers,
} from "@/lib/cs/checklist";
import { ensureCsTables } from "@/lib/cs/agents";
import {
  getCairoYesterdayStartDateString,
  isPaidOnlineHighlight,
  isWithinCairoTodayOrYesterday,
} from "@/lib/cs/order-window";

function snapshotFromOrder(order: AdminOrder) {
  return {
    id: order.id,
    number: order.number,
    customerName: order.customerName,
    phone: order.phone,
    address: order.address,
    governorate: order.governorate,
    area: order.area,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentMethodId: order.paymentMethodId || null,
    total: order.total,
    currency: order.currency,
    dateCreated: order.dateCreated,
    paidOnlineHighlight: isPaidOnlineHighlight(order.paymentMethod, order.paymentMethodId),
    items: order.items,
    freeShippingHint: "راجع رسوم الشحن مع العميل حسب سياسة المتجر",
  };
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

  let imported = 0;
  for (const order of windowOrders) {
    const existing = await prisma.csOrderConfirmation.findUnique({
      where: { wooOrderId: order.id },
    });
    if (existing) {
      await prisma.csOrderConfirmation.update({
        where: { id: existing.id },
        data: {
          wooOrderNumber: order.number,
          customerSnapshot: snapshotFromOrder(order),
        },
      });
      continue;
    }

    await prisma.csOrderConfirmation.create({
      data: {
        wooOrderId: order.id,
        wooOrderNumber: order.number,
        status: CS_CONFIRMATION_STATUS.PENDING,
        customerSnapshot: snapshotFromOrder(order),
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

  await prisma.csOrderConfirmation.upsert({
    where: { wooOrderId: order.id },
    create: {
      wooOrderId: order.id,
      wooOrderNumber: order.number,
      status: CS_CONFIRMATION_STATUS.PENDING,
      customerSnapshot: snapshotFromOrder(order),
    },
    update: {
      wooOrderNumber: order.number,
      customerSnapshot: snapshotFromOrder(order),
    },
  });
}

export async function listCsConfirmations(status?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();

  const rows = await prisma.csOrderConfirmation.findMany({
    where: status && status !== "all" ? { status } : undefined,
    include: { assignedAgent: true, answers: true },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return rows.filter((row) => {
    const snap = row.customerSnapshot as { dateCreated?: string } | null;
    return isWithinCairoTodayOrYesterday(snap?.dateCreated);
  });
}

export type CsQueueSnapshot = {
  customerName?: string;
  phone?: string;
  total?: string;
  dateCreated?: string;
  paymentMethod?: string;
  paymentMethodId?: string | null;
  paidOnlineHighlight?: boolean;
};

export function serializeCsQueueItem(row: Awaited<ReturnType<typeof listCsConfirmations>>[number]) {
  const raw = (row.customerSnapshot as CsQueueSnapshot | null) || null;
  const paidOnlineHighlight =
    raw?.paidOnlineHighlight ??
    isPaidOnlineHighlight(raw?.paymentMethod || "", raw?.paymentMethodId);

  return {
    id: row.id,
    wooOrderId: row.wooOrderId,
    wooOrderNumber: row.wooOrderNumber,
    status: row.status,
    assignedAgent: row.assignedAgent ? { name: row.assignedAgent.name } : null,
    customerSnapshot: raw
      ? {
          customerName: raw.customerName,
          phone: raw.phone,
          total: raw.total,
          dateCreated: raw.dateCreated,
          paymentMethod: raw.paymentMethod,
          paidOnlineHighlight,
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
    return { ok: false as const, message: "الطلب مؤكد مسبقاً." };
  }

  // Refresh snapshot from Woo
  const live = await getAdminOrder(String(row.wooOrderId));
  const snapshot = live ? snapshotFromOrder(live) : row.customerSnapshot;

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

export async function saveCsConfirmation(input: {
  id: number;
  agentId: number;
  answers: CsChecklistAnswerInput[];
  finalize: boolean;
  failContact?: boolean;
  failReason?: string;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة.", missing: [] as string[] };
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: input.id },
    include: { answers: true },
  });
  if (!row) return { ok: false as const, message: "الطلب غير موجود.", missing: [] };

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

  for (const answer of input.answers) {
    if (!CS_CHECKLIST_ITEMS.some((item) => item.key === answer.itemKey)) continue;
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

  if (!input.finalize) {
    await prisma.csOrderConfirmation.update({
      where: { id: input.id },
      data: {
        status: CS_CONFIRMATION_STATUS.IN_PROGRESS,
        assignedAgentId: input.agentId,
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

  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: {
      status: CS_CONFIRMATION_STATUS.CONFIRMED,
      confirmedAt: new Date(),
      assignedAgentId: input.agentId,
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
  // If never imported into CS queue, allow dispatch (legacy orders)
  if (!row) return true;
  return row.status === CS_CONFIRMATION_STATUS.CONFIRMED;
}
