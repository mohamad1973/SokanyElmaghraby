import "server-only";

import { getPrismaClient } from "@/lib/db";
import { ensureCsTables } from "@/lib/cs/agents";
import {
  createDiscountApprovalNotification,
  markDiscountApprovalNotificationsDone,
} from "@/lib/admin-notifications";
import { syncConfirmationMoneyToBosta } from "@/lib/cs/bosta-waybill";
import { ensureCsSokanyWaybill } from "@/lib/cs/sokany-waybill";
import { parseOrderTotalDelta } from "@/lib/cs/confirmations";

export type DiscountApprovalStatus = "none" | "pending" | "approved" | "rejected";

export function normalizeDiscountApprovalStatus(value: unknown): DiscountApprovalStatus {
  const s = String(value || "").trim().toLowerCase();
  if (s === "pending" || s === "approved" || s === "rejected") return s;
  return "none";
}

function snapCustomer(row: { customerSnapshot?: unknown; wooOrderNumber: string; wooOrderId: number }) {
  const raw = (row.customerSnapshot as Record<string, unknown> | null) || {};
  return {
    customerName: String(raw.customerName || ""),
    phone: String(raw.phone || ""),
    total: String(raw.total || ""),
    wooOrderNumber: row.wooOrderNumber,
    wooOrderId: row.wooOrderId,
  };
}

function discountAmountOf(delta: unknown) {
  const n = parseOrderTotalDelta(delta);
  if (n == null || n >= 0) return null;
  return Math.abs(n);
}

export async function requestDiscountApproval(input: {
  id: number;
  agentId: number;
  discountAmount?: number | string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false as const, message: "الطلب غير موجود." };

  const current = normalizeDiscountApprovalStatus(
    (row as { discountApprovalStatus?: string | null }).discountApprovalStatus,
  );
  if (current === "pending") {
    return { ok: false as const, message: "طلب الموافقة مرسل بالفعل وبانتظار رد الأدمن." };
  }

  const raw = Number(String(input.discountAmount ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(raw) || raw <= 0) {
    return { ok: false as const, message: "أدخل قيمة الخصم." };
  }

  const snapTotal = Number(String((row.customerSnapshot as { total?: string } | null)?.total || "").replace(/,/g, ""));
  if (Number.isFinite(snapTotal) && raw > snapTotal) {
    return { ok: false as const, message: "الخصم أكبر من إجمالي الأوردر." };
  }

  const now = new Date();
  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: {
      assignedAgentId: input.agentId,
      orderTotalDelta: -raw,
      discountApprovalStatus: "pending",
      discountApprovalRequestedAt: now,
      discountApprovalDecidedAt: null,
      discountAgentDecisionSeenAt: null,
    } as never,
  });

  const updated = await prisma.csOrderConfirmation.findUnique({
    where: { id: input.id },
    include: { assignedAgent: { select: { id: true, name: true } } },
  });
  const customer = updated ? snapCustomer(updated) : snapCustomer(row);
  const agentName = updated?.assignedAgent?.name || null;

  try {
    await createDiscountApprovalNotification({
      confirmationId: input.id,
      title: `طلب خصم #${customer.wooOrderNumber}`,
      body: {
        confirmationId: input.id,
        wooOrderId: customer.wooOrderId,
        wooOrderNumber: customer.wooOrderNumber,
        customerName: customer.customerName,
        phone: customer.phone,
        total: customer.total,
        discountAmount: raw,
        agentName,
      },
    });
  } catch (error) {
    console.error("[discount-approvals] notification create failed", error);
  }

  return { ok: true as const, status: "pending" as const, discountAmount: raw };
}

export async function listPendingDiscountApprovals() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();

  const rows = await prisma.csOrderConfirmation.findMany({
    where: { discountApprovalStatus: "pending" } as never,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { assignedAgent: { select: { id: true, name: true } } },
  });

  return rows.map((row) => {
    const typed = row as typeof row & {
      orderTotalDelta?: unknown;
      discountApprovalRequestedAt?: Date | null;
    };
    const customer = snapCustomer(row);
    return {
      id: row.id,
      ...customer,
      discountAmount: discountAmountOf(typed.orderTotalDelta),
      discountApprovalRequestedAt: typed.discountApprovalRequestedAt?.toISOString() || null,
      assignedAgent: row.assignedAgent ? { id: row.assignedAgent.id, name: row.assignedAgent.name } : null,
    };
  });
}

export async function getDiscountApprovalById(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id },
    include: { assignedAgent: { select: { id: true, name: true } } },
  });
  if (!row) return null;

  const typed = row as typeof row & {
    orderTotalDelta?: unknown;
    discountApprovalStatus?: string | null;
    discountApprovalRequestedAt?: Date | null;
    discountApprovalDecidedAt?: Date | null;
  };
  const customer = snapCustomer(row);
  return {
    id: row.id,
    status: row.status,
    ...customer,
    discountAmount: discountAmountOf(typed.orderTotalDelta),
    discountApprovalStatus: normalizeDiscountApprovalStatus(typed.discountApprovalStatus),
    discountApprovalRequestedAt: typed.discountApprovalRequestedAt?.toISOString() || null,
    discountApprovalDecidedAt: typed.discountApprovalDecidedAt?.toISOString() || null,
    assignedAgent: row.assignedAgent ? { id: row.assignedAgent.id, name: row.assignedAgent.name } : null,
  };
}

/** Agent cancels a stuck pending discount request so the order can be saved without a discount. */
export async function cancelDiscountApproval(input: { id: number; agentId: number }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false as const, message: "الطلب غير موجود." };

  const current = normalizeDiscountApprovalStatus(
    (row as { discountApprovalStatus?: string | null }).discountApprovalStatus,
  );
  if (current !== "pending") {
    return { ok: false as const, message: "مفيش طلب خصم معلّق لإلغائه." };
  }

  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: {
      assignedAgentId: input.agentId,
      orderTotalDelta: null,
      discountApprovalStatus: null,
      discountApprovalRequestedAt: null,
      discountApprovalDecidedAt: null,
      discountAgentDecisionSeenAt: null,
    } as never,
  });

  try {
    await markDiscountApprovalNotificationsDone(input.id);
  } catch (error) {
    console.error("[discount-approvals] cancel notification done failed", error);
  }

  return { ok: true as const, status: "none" as const };
}

export async function decideDiscountApproval(input: {
  id: number;
  decision: "approved" | "rejected";
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false as const, message: "الطلب غير موجود." };

  const current = normalizeDiscountApprovalStatus(
    (row as { discountApprovalStatus?: string | null }).discountApprovalStatus,
  );
  if (current !== "pending") {
    return { ok: false as const, message: "لا يوجد طلب خصم معلّق لهذا الأوردر." };
  }

  const now = new Date();
  const approved = input.decision === "approved";
  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: {
      discountApprovalStatus: approved ? "approved" : "rejected",
      ...(approved ? {} : { orderTotalDelta: null }),
      discountApprovalDecidedAt: now,
      discountAgentDecisionSeenAt: null,
    } as never,
  });

  try {
    await markDiscountApprovalNotificationsDone(input.id);
  } catch (error) {
    console.error("[discount-approvals] notification done failed", error);
  }

  try {
    await syncConfirmationMoneyToBosta(input.id);
  } catch (error) {
    console.error("[discount-approvals] bosta money sync failed", error);
  }
  try {
    await ensureCsSokanyWaybill(input.id);
  } catch (error) {
    console.error("[discount-approvals] sokany money sync failed", error);
  }

  return { ok: true as const, status: approved ? ("approved" as const) : ("rejected" as const) };
}

export async function listUnseenDiscountDecisionsForAgent(opts: {
  agentId: number;
  isSupervisor: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();

  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      discountApprovalStatus: { in: ["approved", "rejected"] },
      discountApprovalDecidedAt: { not: null },
      discountAgentDecisionSeenAt: null,
      ...(opts.isSupervisor ? {} : { assignedAgentId: opts.agentId }),
    } as never,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return rows.map((row) => {
    const typed = row as typeof row & {
      discountApprovalStatus?: string | null;
      orderTotalDelta?: unknown;
      discountApprovalDecidedAt?: Date | null;
    };
    return {
      id: row.id,
      wooOrderNumber: row.wooOrderNumber,
      decision: normalizeDiscountApprovalStatus(typed.discountApprovalStatus) as "approved" | "rejected",
      discountAmount: discountAmountOf(typed.orderTotalDelta),
      decidedAt: typed.discountApprovalDecidedAt?.toISOString() || null,
    };
  });
}

export async function markDiscountDecisionsSeen(input: { ids: number[]; agentId: number }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const ids = input.ids.filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { ok: true as const };

  const now = new Date();
  await prisma.csOrderConfirmation.updateMany({
    where: {
      id: { in: ids },
      discountApprovalStatus: { in: ["approved", "rejected"] },
      discountAgentDecisionSeenAt: null,
    } as never,
    data: { discountAgentDecisionSeenAt: now } as never,
  });

  return { ok: true as const };
}
