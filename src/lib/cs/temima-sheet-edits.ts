import "server-only";

import { getPrismaClient } from "@/lib/db";
import { serializeCsQueueItem } from "@/lib/cs/confirmations";
import type { TemimaSheetEdit } from "@/lib/cs/temima-sheet";

function asKind(value: string): TemimaSheetEdit["kind"] | null {
  return value === "include" || value === "exclude" ? value : null;
}

export function orderNumberTokens(raw: string) {
  return [
    ...new Set(
      String(raw || "")
        .split(/[\s,،]+/)
        .map((part) => part.replace(/\D/g, ""))
        .filter((digits) => digits.length >= 3),
    ),
  ];
}

export async function listTemimaSheetEdits(): Promise<TemimaSheetEdit[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  const rows = await prisma.csTemimaSheetEdit.findMany({
    orderBy: { dayYmd: "desc" },
    take: 500,
    select: { dayYmd: true, confirmationId: true, kind: true },
  });
  return rows.flatMap((row) => {
    const kind = asKind(row.kind);
    return kind ? [{ dayYmd: row.dayYmd, confirmationId: row.confirmationId, kind }] : [];
  });
}

export async function mergeIncludedConfirmations<T extends { id: number }>(items: T[]) {
  const prisma = getPrismaClient();
  const edits = await listTemimaSheetEdits();
  if (!prisma) return { items, edits };
  const have = new Set(items.map((item) => item.id));
  const missing = [
    ...new Set(
      edits.filter((row) => row.kind === "include" && !have.has(row.confirmationId)).map((row) => row.confirmationId),
    ),
  ];
  if (!missing.length) return { items, edits };
  const rows = await prisma.csOrderConfirmation.findMany({
    where: { id: { in: missing }, status: "CONFIRMED" },
    include: { assignedAgent: true, answers: true },
  });
  const extra = rows.map((row) => serializeCsQueueItem(row)) as unknown as T[];
  return { items: [...items, ...extra], edits };
}

export async function includeTemimaOrders(dayYmd: string, rawNumbers: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) return { ok: false as const, message: "اليوم غير صحيح." };
  const tokens = orderNumberTokens(rawNumbers);
  if (!tokens.length) return { ok: false as const, message: "اكتب رقم الأوردر." };
  const rows = await prisma.csOrderConfirmation.findMany({
    where: { status: "CONFIRMED", OR: tokens.map((token) => ({ wooOrderNumber: { contains: token } })) },
    include: { assignedAgent: true, answers: true },
  });
  const found = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const digits = String(row.wooOrderNumber || "").replace(/\D/g, "");
    const token = tokens.find((item) => item === digits);
    if (!token || found.has(token)) continue;
    found.set(token, row);
  }
  const missing = tokens.filter((token) => !found.has(token));
  const matched = [...found.values()];
  if (!matched.length) return { ok: false as const, message: `مش موجود: ${missing.join("، ")}` };
  for (const row of matched) {
    await prisma.csTemimaSheetEdit.upsert({
      where: { dayYmd_confirmationId: { dayYmd, confirmationId: row.id } },
      create: { dayYmd, confirmationId: row.id, kind: "include" },
      update: { kind: "include" },
    });
  }
  const edits = matched.map((row) => ({ dayYmd, confirmationId: row.id, kind: "include" as const }));
  return {
    ok: true as const,
    edits,
    items: matched.map((row) => serializeCsQueueItem(row)),
    missing,
    message: missing.length ? `اتضاف ${matched.length}. مش موجود: ${missing.join("، ")}` : `اتضاف ${matched.length}.`,
  };
}

export async function excludeTemimaOrder(dayYmd: string, confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd) || !Number.isInteger(confirmationId) || confirmationId <= 0) {
    return { ok: false as const, message: "الأوردر غير صحيح." };
  }
  const order = await prisma.csOrderConfirmation.findUnique({ where: { id: confirmationId }, select: { id: true } });
  if (!order) return { ok: false as const, message: "الأوردر مش موجود." };
  await prisma.csTemimaSheetEdit.upsert({
    where: { dayYmd_confirmationId: { dayYmd, confirmationId } },
    create: { dayYmd, confirmationId, kind: "exclude" },
    update: { kind: "exclude" },
  });
  await prisma.csOrderConfirmation.update({
    where: { id: confirmationId },
    data: { courierAgentId: null, courierAssignedAt: null, courierOutcome: null, courierRefusalReason: null },
  });
  return { ok: true as const, edit: { dayYmd, confirmationId, kind: "exclude" as const } };
}
