import "server-only";

import { getPrismaClient } from "@/lib/db";
import { serializeCsQueueItem } from "@/lib/cs/confirmations";
import { addCairoYmdDays, cairoClock, cairoTodayYmd, cairoYmdBounds } from "@/lib/cs/order-window";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import {
  addTemimaFreezeIds,
  clearTemimaPrepareHold,
  hasTemimaFreezeDay,
  hasTemimaPrepareHold,
  listEarliestFreezeDays,
  listTemimaFreezeIds,
  listTemimaFrozenDays,
  removeTemimaFreezeExcept,
  removeTemimaFreezeId,
  saveTemimaFreeze,
} from "@/lib/cs/temima-sheet-freeze";
import { onUnifiedSayedSheet, sayedSheetYmd, type TemimaSheetEdit } from "@/lib/cs/temima-sheet";

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
    take: 2000,
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

function eachSheetDay(dateFrom: string, dateTo: string) {
  const days: string[] = [];
  let cursor = dateFrom;
  while (cursor && cursor <= dateTo && days.length < 40) {
    days.push(cursor);
    cursor = addCairoYmdDays(cursor, 1);
  }
  return days;
}

async function idsOwnedInsideRange(ids: number[], dateFrom: string, dateTo: string) {
  const unique = [...new Set(ids)];
  const owners = await listEarliestFreezeDays(unique);
  if (!owners.size) return unique.sort((a, b) => b - a);
  return unique
    .filter((id) => {
      const owner = owners.get(id);
      if (!owner) return true;
      return owner >= dateFrom && owner <= dateTo;
    })
    .sort((a, b) => b - a);
}

let restoredTodayYmd = "";
let restoringToday: Promise<void> | null = null;

function cairoIso(value: Date | string | null | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function touchedToday(value: Date | string | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const time = new Date(cairoIso(value)).getTime();
  return time >= start.getTime() && time < end.getTime();
}

async function pinOrderToSaveDay(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  confirmationId: number,
  saveDay: string,
  today: string,
) {
  await prisma.csTemimaSheetEdit.upsert({
    where: { dayYmd_confirmationId: { dayYmd: saveDay, confirmationId } },
    create: { dayYmd: saveDay, confirmationId, kind: "include" },
    update: { kind: "include" },
  });
  await prisma.csTemimaSheetEdit.upsert({
    where: { dayYmd_confirmationId: { dayYmd: today, confirmationId } },
    create: { dayYmd: today, confirmationId, kind: "exclude" },
    update: { kind: "exclude" },
  });
  await removeTemimaFreezeId(today, confirmationId);
  if (await hasTemimaFreezeDay(saveDay)) await addTemimaFreezeIds(saveDay, [confirmationId]);
}

async function restoreTodayEditsToClosedSheetDay() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const today = cairoTodayYmd();
  const bounds = cairoYmdBounds(today);
  if (!bounds) return;
  const itemAdds = await prisma.$queryRawUnsafe<Array<{ confirmationId: number | bigint }>>(
    "SELECT DISTINCT confirmationId FROM CsOrderItemAdd WHERE status = 'approved' AND decidedAt >= ? AND decidedAt < ?",
    bounds.start,
    bounds.endExclusive,
  );
  const itemIds = [...new Set(itemAdds.map((row) => Number(row.confirmationId)).filter((id) => id > 0))];
  const [edited, edits] = await Promise.all([
    prisma.csOrderConfirmation.findMany({
      where: {
        shippingCompany: "sayed_temima",
        status: "CONFIRMED",
        confirmedAt: { not: null, lt: bounds.start },
        OR: [
          { confirmationEditedAt: { gte: bounds.start, lt: bounds.endExclusive } },
          { handedToCarrierAt: { gte: bounds.start, lt: bounds.endExclusive } },
          ...(itemIds.length ? [{ id: { in: itemIds } }] : []),
        ],
      },
      select: { id: true, confirmedAt: true, confirmationEditedAt: true, handedToCarrierAt: true },
    }),
    listTemimaSheetEdits(),
  ]);
  for (const row of edited) {
    const clock = cairoClock(cairoIso(row.confirmedAt));
    if (!clock || clock.ymd >= today) continue;
    const moved = edits.some(
      (edit) =>
        edit.confirmationId === row.id &&
        ((edit.dayYmd === clock.ymd && edit.kind === "exclude") ||
          (edit.dayYmd === today && edit.kind === "include")),
    );
    if (moved) continue;
    const touched =
      itemIds.includes(row.id) ||
      touchedToday(row.confirmationEditedAt, bounds.start, bounds.endExclusive) ||
      touchedToday(row.handedToCarrierAt, bounds.start, bounds.endExclusive);
    if (!touched) continue;
    await pinOrderToSaveDay(prisma, row.id, clock.ymd, today);
  }
}

function restoreTodayEditsOnce() {
  const today = cairoTodayYmd();
  if (restoredTodayYmd === today) return Promise.resolve();
  if (!restoringToday) {
    restoringToday = restoreTodayEditsToClosedSheetDay()
      .then(() => {
        restoredTodayYmd = cairoTodayYmd();
      })
      .finally(() => {
        restoringToday = null;
      });
  }
  return restoringToday;
}

async function liveUnifiedSayedSheetIds(dateFrom: string, dateTo: string) {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) return [];
  const from = cairoYmdBounds(dateFrom);
  const to = cairoYmdBounds(dateTo);
  if (!from || !to) return [];
  const [cutoffs, edits] = await Promise.all([listTemimaCutoffs(), listTemimaSheetEdits()]);
  const rows = await prisma.csOrderConfirmation.findMany({
    where: {
      status: "CONFIRMED",
      shippingCompany: "sayed_temima",
      OR: [
        { confirmedAt: { gte: from.start, lt: to.endExclusive } },
        { handedToCarrierAt: { gte: from.start, lt: to.endExclusive } },
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
  const ids = [...rows, ...extra]
    .filter((row) => onUnifiedSayedSheet(row, dateFrom, dateTo, cutoffs, edits))
    .map((row) => row.id);
  return idsOwnedInsideRange(ids, dateFrom, dateTo);
}

/** A closed day is snapshotted once. Later saves, edits, and handoffs do not change it. */
export async function captureTemimaSheetFreeze(dayYmd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) return;
  const cutoffs = await listTemimaCutoffs();
  if (!cutoffs.some((row) => row.dayYmd === dayYmd)) return;
  if (await hasTemimaFreezeDay(dayYmd)) return;
  const ids = await liveUnifiedSayedSheetIds(dayYmd, dayYmd);
  await saveTemimaFreeze(dayYmd, ids);
}

async function ensureClosedDaysFrozen(dateFrom: string, dateTo: string) {
  const cutoffs = await listTemimaCutoffs();
  for (const day of eachSheetDay(dateFrom, dateTo)) {
    if (!cutoffs.some((row) => row.dayYmd === day)) continue;
    if (await hasTemimaFreezeDay(day)) continue;
    if (await hasTemimaPrepareHold(day)) continue;
    await captureTemimaSheetFreeze(day);
  }
}

/** Admin backfill: snapshot the orders visible on a prepared day. A second press does not replace the snapshot. */
export async function freezePreparedTemimaDay(dayYmd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) return { ok: false as const, message: "اليوم غير صحيح." };
  if (await hasTemimaFreezeDay(dayYmd)) {
    return { ok: true as const, dayYmd, frozen: true as const, message: "الشيت متجمد من وقت القفل." };
  }
  const cutoffs = await listTemimaCutoffs();
  if (!cutoffs.some((row) => row.dayYmd === dayYmd)) {
    return { ok: false as const, message: "جهّز اليوم الأول." };
  }
  await captureTemimaSheetFreeze(dayYmd);
  await clearTemimaPrepareHold(dayYmd);
  if (!(await hasTemimaFreezeDay(dayYmd))) return { ok: false as const, message: "تعذر تجميد اليوم." };
  return { ok: true as const, dayYmd, frozen: true as const, message: "اتقفل وتجمد." };
}

export async function listUnifiedSayedSheetIds(dateFrom: string, dateTo: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) return [];
  await restoreTodayEditsOnce();
  await ensureClosedDaysFrozen(dateFrom, dateTo);
  const days = eachSheetDay(dateFrom, dateTo);
  const frozen = await listTemimaFrozenDays(dateFrom, dateTo);
  const frozenIds = new Set<number>();
  for (const day of days) {
    if (!frozen.has(day)) continue;
    for (const id of await listTemimaFreezeIds(day)) frozenIds.add(id);
  }
  if (days.length && days.every((day) => frozen.has(day))) {
    return idsOwnedInsideRange([...frozenIds], dateFrom, dateTo);
  }
  const liveIds = await liveUnifiedSayedSheetIds(dateFrom, dateTo);
  if (!frozen.size) return liveIds;
  const prisma = getPrismaClient();
  if (!prisma || !liveIds.length) return idsOwnedInsideRange([...frozenIds], dateFrom, dateTo);
  const [cutoffs, edits] = await Promise.all([listTemimaCutoffs(), listTemimaSheetEdits()]);
  const rows = await prisma.csOrderConfirmation.findMany({
    where: { id: { in: liveIds } },
    select: SHEET_PICK,
  });
  const openIds = new Set<number>();
  for (const row of rows) {
    const day = sayedSheetYmd(row, cutoffs);
    if (day && day >= dateFrom && day <= dateTo && !frozen.has(day)) {
      const excluded = edits.some((edit) => edit.confirmationId === row.id && edit.dayYmd === day && edit.kind === "exclude");
      if (!excluded) openIds.add(row.id);
    }
    for (const edit of edits) {
      if (edit.kind !== "include" || edit.confirmationId !== row.id) continue;
      if (edit.dayYmd < dateFrom || edit.dayYmd > dateTo || frozen.has(edit.dayYmd)) continue;
      openIds.add(row.id);
    }
  }
  return idsOwnedInsideRange([...frozenIds, ...openIds], dateFrom, dateTo);
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

export async function closedPreviousSayedSheetDay(order: {
  id: number;
  confirmedAt?: Date | string | null;
  shippingCompany?: string | null;
  status?: string | null;
}) {
  if (order.shippingCompany !== "sayed_temima") return null;
  if (order.status && order.status !== "CONFIRMED") return null;
  const today = cairoTodayYmd();
  const owners = await listEarliestFreezeDays([order.id]);
  const frozen = owners.get(order.id);
  if (frozen && frozen < today) return frozen;
  const clock = cairoClock(cairoIso(order.confirmedAt));
  if (!clock || clock.ymd >= today) return null;
  return clock.ymd;
}

export async function placeSayedOrderOnChosenDay(
  confirmationId: number,
  choice: "previous" | "today",
  closedDay: string,
) {
  const prisma = getPrismaClient();
  if (!prisma || !/^\d{4}-\d{2}-\d{2}$/.test(closedDay)) return;
  const today = cairoTodayYmd();
  if (choice === "previous") {
    await pinOrderToSaveDay(prisma, confirmationId, closedDay, today);
    return;
  }
  await removeTemimaFreezeExcept(confirmationId, today);
  await prisma.csTemimaSheetEdit.upsert({
    where: { dayYmd_confirmationId: { dayYmd: closedDay, confirmationId } },
    create: { dayYmd: closedDay, confirmationId, kind: "exclude" },
    update: { kind: "exclude" },
  });
  await prisma.csTemimaSheetEdit.upsert({
    where: { dayYmd_confirmationId: { dayYmd: today, confirmationId } },
    create: { dayYmd: today, confirmationId, kind: "include" },
    update: { kind: "include" },
  });
  if (await hasTemimaFreezeDay(today)) await addTemimaFreezeIds(today, [confirmationId]);
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
  const owners = await listEarliestFreezeDays(rows.map((row) => row.id));
  const allowed = rows.filter((row) => {
    const owner = owners.get(row.id);
    return !owner || owner === dayYmd;
  });
  if (!allowed.length) {
    return { ok: false as const, message: "الأوردر على شيت يوم مقفول، وما ينفعش يظهر في يوم تاني." };
  }
  for (const row of allowed) {
    await prisma.csTemimaSheetEdit.upsert({
      where: { dayYmd_confirmationId: { dayYmd, confirmationId: row.id } },
      create: { dayYmd, confirmationId: row.id, kind: "include" },
      update: { kind: "include" },
    });
  }
  if (await hasTemimaFreezeDay(dayYmd)) await addTemimaFreezeIds(dayYmd, allowed.map((row) => row.id));
  const edits = allowed.map((row) => ({ dayYmd, confirmationId: row.id, kind: "include" as const }));
  const skipped = rows.length - allowed.length;
  return {
    ok: true as const,
    edits,
    items: allowed.map((row) => serializeCsQueueItem(row)),
    message: skipped ? `اتضاف ${allowed.length}. والباقي على يوم مقفول.` : `اتضاف ${allowed.length}.`,
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
  if (await hasTemimaFreezeDay(dayYmd)) await removeTemimaFreezeId(dayYmd, confirmationId);
  await prisma.csOrderConfirmation.update({
    where: { id: confirmationId },
    data: { courierAgentId: null, courierAssignedAt: null, courierOutcome: null, courierRefusalReason: null },
  });
  return { ok: true as const, edit: { dayYmd, confirmationId, kind: "exclude" as const } };
}
