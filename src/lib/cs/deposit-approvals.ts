import "server-only";

import { getPrismaClient } from "@/lib/db";
import { ensureCsTables } from "@/lib/cs/agents";
import {
  normalizeDepositFromNumber,
  normalizeDepositPayMethod,
  normalizeDepositToPhone,
  parseDepositAmount,
  serializeDepositAmount,
} from "@/lib/cs/confirmations";

export type DepositApprovalStatus = "none" | "pending" | "approved" | "rejected";

export function normalizeDepositApprovalStatus(value: unknown): DepositApprovalStatus {
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

export async function requestDepositApproval(input: {
  id: number;
  agentId: number;
  depositAmount?: number | string | null;
  depositPayMethod?: string | null;
  depositFromNumber?: string | null;
  depositToPhone?: string | null;
  depositToMethod?: string | null;
  depositPaidAt?: string | null;
  depositProofUrl?: string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false as const, message: "الطلب غير موجود." };

  const amount = parseDepositAmount(input.depositAmount);
  const proofUrl = String(input.depositProofUrl || "").trim();
  const paidAtRaw = String(input.depositPaidAt || "").trim();
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;

  if (!amount || amount <= 0) {
    return { ok: false as const, message: "أدخل قيمة المقدم." };
  }
  if (!proofUrl) {
    return { ok: false as const, message: "أرفق صورة التحويل." };
  }
  if (!paidAt || Number.isNaN(paidAt.getTime())) {
    return { ok: false as const, message: "أدخل تاريخ ووقت الدفع." };
  }

  const payMethod = normalizeDepositPayMethod(input.depositPayMethod);
  const toPhone = normalizeDepositToPhone(input.depositToPhone);
  const toMethod = normalizeDepositPayMethod(input.depositToMethod);

  const now = new Date();
  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: {
      assignedAgentId: input.agentId,
      depositAmount: amount,
      depositPayMethod: payMethod,
      depositFromNumber: normalizeDepositFromNumber(input.depositFromNumber),
      depositToPhone: toPhone,
      depositToMethod: toMethod,
      depositPaidAt: paidAt,
      depositProofUrl: proofUrl.slice(0, 512),
      depositApprovalStatus: "pending",
      depositApprovalRequestedAt: now,
      depositApprovalDecidedAt: null,
      depositAgentDecisionSeenAt: null,
      depositPaid: false,
    } as never,
  });

  return { ok: true as const, status: "pending" as const };
}

export async function listPendingDepositApprovals() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();

  const rows = await prisma.csOrderConfirmation.findMany({
    where: { depositApprovalStatus: "pending" } as never,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { assignedAgent: { select: { id: true, name: true } } },
  });

  return rows.map((row) => {
    const typed = row as typeof row & {
      depositAmount?: unknown;
      depositPayMethod?: string | null;
      depositFromNumber?: string | null;
      depositToPhone?: string | null;
      depositToMethod?: string | null;
      depositPaidAt?: Date | null;
      depositProofUrl?: string | null;
      depositApprovalRequestedAt?: Date | null;
    };
    const customer = snapCustomer(row);
    return {
      id: row.id,
      ...customer,
      depositAmount: serializeDepositAmount(typed.depositAmount),
      depositPayMethod: normalizeDepositPayMethod(typed.depositPayMethod),
      depositFromNumber: typed.depositFromNumber || null,
      depositToPhone: typed.depositToPhone || null,
      depositToMethod: normalizeDepositPayMethod(typed.depositToMethod),
      depositPaidAt: typed.depositPaidAt?.toISOString() || null,
      depositProofUrl: typed.depositProofUrl || null,
      depositApprovalRequestedAt: typed.depositApprovalRequestedAt?.toISOString() || null,
      assignedAgent: row.assignedAgent ? { id: row.assignedAgent.id, name: row.assignedAgent.name } : null,
    };
  });
}

export async function getDepositApprovalById(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id },
    include: { assignedAgent: { select: { id: true, name: true } } },
  });
  if (!row) return null;

  const typed = row as typeof row & {
    depositAmount?: unknown;
    depositPaid?: boolean;
    depositPayMethod?: string | null;
    depositFromNumber?: string | null;
    depositToPhone?: string | null;
    depositToMethod?: string | null;
    depositPaidAt?: Date | null;
    depositProofUrl?: string | null;
    depositApprovalStatus?: string | null;
    depositApprovalRequestedAt?: Date | null;
    depositApprovalDecidedAt?: Date | null;
  };
  const customer = snapCustomer(row);
  return {
    id: row.id,
    status: row.status,
    ...customer,
    depositAmount: serializeDepositAmount(typed.depositAmount),
    depositPaid: Boolean(typed.depositPaid),
    depositPayMethod: normalizeDepositPayMethod(typed.depositPayMethod),
    depositFromNumber: typed.depositFromNumber || null,
    depositToPhone: typed.depositToPhone || null,
    depositToMethod: normalizeDepositPayMethod(typed.depositToMethod),
    depositPaidAt: typed.depositPaidAt?.toISOString() || null,
    depositProofUrl: typed.depositProofUrl || null,
    depositApprovalStatus: normalizeDepositApprovalStatus(typed.depositApprovalStatus),
    depositApprovalRequestedAt: typed.depositApprovalRequestedAt?.toISOString() || null,
    depositApprovalDecidedAt: typed.depositApprovalDecidedAt?.toISOString() || null,
    assignedAgent: row.assignedAgent ? { id: row.assignedAgent.id, name: row.assignedAgent.name } : null,
  };
}

export async function decideDepositApproval(input: {
  id: number;
  decision: "approved" | "rejected";
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const row = await prisma.csOrderConfirmation.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false as const, message: "الطلب غير موجود." };

  const current = normalizeDepositApprovalStatus(
    (row as { depositApprovalStatus?: string | null }).depositApprovalStatus,
  );
  if (current !== "pending") {
    return { ok: false as const, message: "لا يوجد طلب موافقة معلّق لهذا الأوردر." };
  }

  const now = new Date();
  const approved = input.decision === "approved";
  await prisma.csOrderConfirmation.update({
    where: { id: input.id },
    data: {
      depositApprovalStatus: approved ? "approved" : "rejected",
      depositPaid: approved,
      depositApprovalDecidedAt: now,
      depositAgentDecisionSeenAt: null,
    } as never,
  });

  return { ok: true as const, status: approved ? ("approved" as const) : ("rejected" as const) };
}

export async function listUnseenDepositDecisionsForAgent(opts: {
  agentId: number;
  isSupervisor: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureCsTables();

  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      depositApprovalStatus: { in: ["approved", "rejected"] },
      depositApprovalDecidedAt: { not: null },
      depositAgentDecisionSeenAt: null,
      ...(opts.isSupervisor ? {} : { assignedAgentId: opts.agentId }),
    } as never,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return rows.map((row) => {
    const typed = row as typeof row & {
      depositApprovalStatus?: string | null;
      depositAmount?: unknown;
      depositApprovalDecidedAt?: Date | null;
    };
    return {
      id: row.id,
      wooOrderNumber: row.wooOrderNumber,
      decision: normalizeDepositApprovalStatus(typed.depositApprovalStatus) as "approved" | "rejected",
      depositAmount: serializeDepositAmount(typed.depositAmount),
      decidedAt: typed.depositApprovalDecidedAt?.toISOString() || null,
    };
  });
}

export async function markDepositDecisionsSeen(input: { ids: number[]; agentId: number }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const ids = input.ids.filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { ok: true as const };

  const now = new Date();
  await prisma.csOrderConfirmation.updateMany({
    where: {
      id: { in: ids },
      depositApprovalStatus: { in: ["approved", "rejected"] },
      depositAgentDecisionSeenAt: null,
    } as never,
    data: { depositAgentDecisionSeenAt: now } as never,
  });

  return { ok: true as const };
}
