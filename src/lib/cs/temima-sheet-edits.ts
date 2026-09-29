import "server-only";

import { getPrismaClient } from "@/lib/db";
import { serializeCsQueueItem } from "@/lib/cs/confirmations";
import { addCairoYmdDays, cairoYmdBounds } from "@/lib/cs/order-window";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { onUnifiedSayedSheet, type TemimaSheetEdit } from "@/lib/cs/temima-sheet";

function asKind(value: string): TemimaSheetEdit["kind"] | null {
  return value === "include" || value === "exclude" ? value : null;
}

export type TemimaSheetSearchHit = {
  id: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  status: string;
};

function cleanLike(value: string) {
  return value.trim().slice(0, 80).replace(/[\\%_]/g, "");
}

function snapshotText(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text === "null" ? "" : text;
}

export async function searchTemimaSheetOrders(rawQuery: string) {
  const prisma = getPrismaClient();
  const query = rawQuery.trim().slice(0, 80);
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة.", matches: [] as TemimaSheetSearchHit[] };
  if (query.length < 2) return { ok: true as const, matches: [] as TemimaSheetSearchHit[] };

  const hasLetters = /[A-Za-z\u0600-\u06FF]/.test(query);
  const digits = query.replace(/\D/g, "");
  const where: string[] = [];
  const params: string[] = [];
  if (hasLetters) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.customerName')) LIKE ?");
    params.push(`%${cleanLike(query)}%`);
  }
  if (digits.length >= 3) {
    where.push("REPLACE(REPLACE(wooOrderNumber, '#', ''), ' ', '') = ?");
    params.push(digits);
    where.push("JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.phone')) LIKE ?");
    params.push(`%${digits}%`);
  }
  if (!where.length) return { ok: true as const, matches: [] as TemimaSheetSearchHit[] };

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: number | bigint;
      wooOrderNumber: string;
      status: string;
      customerName: string | null;
      phone: string | null;
    }>
  >(
    `SELECT id, wooOrderNumber, status,
      JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.customerName')) AS customerName,
      JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.phone')) AS phone
     FROM CsOrderConfirmation
     WHERE ${where.join(" OR ")}
     ORDER BY id DESC
     LIMIT 20`,
    ...params,
  );
  return {
    ok: true as const,
    matches: rows.map((row) => ({
      id: Number(row.id),
      wooOrderNumber: String(row.wooOrderNumber || ""),
      customerName: snapshotText(row.customerName),
      phone: snapshotText(row.phone),
      status: String(row.status || ""),
    })),
  };
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
    where: { id: { in: missing } },
    include: { assignedAgent: true, answers: true },
  });
  const extra = rows.map((row) => serializeCsQueueItem(row)) as unknown as T[];
  return { items: [...items, ...extra], edits };
}

const SHEET_PICK = {
  id: true,
  status: true,
  shippingCompany: true,
  confirmedAt: true,
  handedToCarrier: true,
  handedToCarrierAt: true,
} as const;

export async function listUnifiedSayedSheetIds(dateFrom: string, dateTo: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) return [];
  const saveFrom = cairoYmdBounds(addCairoYmdDays(dateFrom, -1));
  const handFrom = cairoYmdBounds(dateFrom);
  const to = cairoYmdBounds(dateTo);
  if (!saveFrom || !handFrom || !to) return [];
  const [cutoffs, edits] = await Promise.all([listTemimaCutoffs(), listTemimaSheetEdits()]);
  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      status: "CONFIRMED",
      shippingCompany: "sayed_temima",
      OR: [
        { confirmedAt: { gte: saveFrom.start, lt: to.endExclusive } },
        { handedToCarrierAt: { gte: handFrom.start, lt: to.endExclusive } },
      ],
    },
    select: SHEET_PICK,
    orderBy: { id: "desc" },
    take: 5000,
  });
  const have = new Set(rows.map((row) => row.id));
  const includeIds = [
    ...new Set(
      edits
        .filter((row) => row.kind === "include" && row.dayYmd >= dateFrom && row.dayYmd <= dateTo && !have.has(row.confirmationId))
        .map((row) => row.confirmationId),
    ),
  ];
  const extra = includeIds.length
    ? await prisma.csOrderConfirmation.findMany({
        where: { id: { in: includeIds } },
        select: SHEET_PICK,
      })
    : [];
  return [...rows, ...extra]
    .filter((row) => onUnifiedSayedSheet(row, dateFrom, dateTo, cutoffs, edits))
    .sort((a, b) => b.id - a.id)
    .map((row) => row.id);
}

export async function listUnifiedSayedSheet(dateFrom: string, dateTo: string) {
  const prisma = getPrismaClient();
  const ids = await listUnifiedSayedSheetIds(dateFrom, dateTo);
  if (!prisma || !ids.length) return [];
  const rows = await prisma.csOrderConfirmation.findMany({
    where: { id: { in: ids } },
    include: { assignedAgent: true, answers: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [serializeCsQueueItem(row)] : [];
  });
}

export async function listSayedSheetOrders(dateFrom: string, dateTo: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) return [];
  const from = cairoYmdBounds(dateFrom);
  const to = cairoYmdBounds(dateTo);
  if (!from || !to) return [];
  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      status: "CONFIRMED",
      shippingCompany: "sayed_temima",
      OR: [
        { confirmedAt: { gte: from.start, lt: to.endExclusive } },
        { handedToCarrierAt: { gte: from.start, lt: to.endExclusive } },
      ],
    },
    include: { assignedAgent: true, answers: true },
    take: 2000,
  });
  const edits = await listTemimaSheetEdits();
  const have = new Set(rows.map((row) => row.id));
  const missing = [
    ...new Set(
      edits
        .filter((row) => row.kind === "include" && row.dayYmd >= dateFrom && row.dayYmd <= dateTo && !have.has(row.confirmationId))
        .map((row) => row.confirmationId),
    ),
  ];
  const extra = missing.length
    ? await prisma.csOrderConfirmation.findMany({
        where: { id: { in: missing } },
        include: { assignedAgent: true, answers: true },
      })
    : [];
  return [...rows, ...extra].map((row) => serializeCsQueueItem(row));
}

/** Same rows every Temima screen shows for these days, including admin include and exclude. */
export async function listVisibleSayedSheet(dateFrom: string, dateTo: string) {
  return listUnifiedSayedSheet(dateFrom, dateTo);
}

export async function includeTemimaOrders(dayYmd: string, confirmationIds: number[]) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) return { ok: false as const, message: "اليوم غير صحيح." };
  const ids = [...new Set(confirmationIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 20);
  if (!ids.length) return { ok: false as const, message: "اختر أوردر من النتائج." };
  const rows = await prisma.csOrderConfirmation.findMany({
    where: { id: { in: ids } },
    include: { assignedAgent: true, answers: true },
  });
  if (!rows.length) return { ok: false as const, message: "مش موجود في الأوردرات." };
  for (const row of rows) {
    await prisma.csTemimaSheetEdit.upsert({
      where: { dayYmd_confirmationId: { dayYmd, confirmationId: row.id } },
      create: { dayYmd, confirmationId: row.id, kind: "include" },
      update: { kind: "include" },
    });
  }
  const edits = rows.map((row) => ({ dayYmd, confirmationId: row.id, kind: "include" as const }));
  return {
    ok: true as const,
    edits,
    items: rows.map((row) => serializeCsQueueItem(row)),
    message: `اتضاف ${rows.length}.`,
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
