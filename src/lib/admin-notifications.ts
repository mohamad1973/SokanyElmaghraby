import "server-only";

import { getPrismaClient } from "@/lib/db";
import { ensureCsTables } from "@/lib/cs/agents";

export type AdminNotificationType = "deposit_approval";
export type AdminNotificationStatus = "unread" | "read" | "done";

export type DepositApprovalNotificationBody = {
  confirmationId: number;
  wooOrderId: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  depositAmount: number | null;
  depositPayMethod: string | null;
  depositFromNumber: string | null;
  depositInstapayName: string | null;
  depositToPhone: string | null;
  depositToMethod: string | null;
  depositPaidAt: string | null;
  depositProofUrl: string | null;
  agentName: string | null;
};

async function ensureInboxTable() {
  await ensureCsTables();
}

export async function createDepositApprovalNotification(input: {
  confirmationId: number;
  title: string;
  body: DepositApprovalNotificationBody;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await ensureInboxTable();

  // Close any prior open notifications for this confirmation
  await prisma.adminNotification.updateMany({
    where: {
      type: "deposit_approval",
      refId: input.confirmationId,
      status: { in: ["unread", "read"] },
    },
    data: { status: "done" },
  });

  return prisma.adminNotification.create({
    data: {
      type: "deposit_approval",
      refId: input.confirmationId,
      title: input.title.slice(0, 255),
      body: input.body,
      status: "unread",
    },
  });
}

export async function markDepositApprovalNotificationsDone(confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await ensureInboxTable();

  await prisma.adminNotification.updateMany({
    where: {
      type: "deposit_approval",
      refId: confirmationId,
      status: { in: ["unread", "read"] },
    },
    data: { status: "done" },
  });
}

export async function listOpenAdminNotifications(opts?: { limit?: number }) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  await ensureInboxTable();

  const rows = await prisma.adminNotification.findMany({
    where: { status: { in: ["unread", "read"] } },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 50,
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    refId: row.refId,
    title: row.title,
    body: row.body as DepositApprovalNotificationBody | null,
    status: row.status as AdminNotificationStatus,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countUnreadAdminNotifications() {
  const prisma = getPrismaClient();
  if (!prisma) return 0;
  await ensureInboxTable();

  return prisma.adminNotification.count({
    where: { status: "unread" },
  });
}

export async function markAdminNotificationsRead(ids?: number[]) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureInboxTable();

  if (ids?.length) {
    await prisma.adminNotification.updateMany({
      where: { id: { in: ids }, status: "unread" },
      data: { status: "read" },
    });
  } else {
    await prisma.adminNotification.updateMany({
      where: { status: "unread" },
      data: { status: "read" },
    });
  }

  return { ok: true as const };
}
