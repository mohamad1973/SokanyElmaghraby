import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import {
  isFawryMethod,
  sheetCollectedSplit,
  sheetSplitFromConfirmation,
} from "@/lib/cs/order-window";
import { cairoTodayYmd, cairoYmdBounds, cairoYmdFromIso } from "@/lib/cs/order-window";
import { listSettlementSheetDayMap, listTemimaSheetEdits } from "@/lib/cs/temima-sheet-edits";
import { sayedSheetYmd } from "@/lib/cs/temima-sheet";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { captureDeskReturnFromConfirmation } from "@/lib/cs/bosta-return-capture";
import { getPrismaClient } from "@/lib/db";

export const TEMIMA_COMPANY = "sayed_temima";
const FEE_NORMAL = 75;
const FEE_LARGE = 100;
const CARRY_DAY_KEY = 1;

export type TemimaDisposition = "collect" | "return" | "postpone";

function storedDisposition(value: string | null | undefined): TemimaDisposition | "" {
  if (value === "collect" || value === "return" || value === "postpone") return value;
  return "";
}

export type TemimaSheetRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  productNames: string;
  phone: string;
  address: string;
  cashAmount: number;
  depositAmount: number;
  orderTotal: number;
  fawry: boolean;
  disposition: TemimaDisposition | "";
  isLarge: boolean;
  carried: boolean;
  carryLocked?: boolean;
  postponeLineId: number | null;
  sheetDay: string;
  carryFromStart?: string;
  carryFromEnd?: string;
  refusalReason?: string;
};

export type TemimaCarryForward = {
  fromYmd: string;
  toYmd: string;
  confirmationIds: number[];
};

export type TemimaRefusalRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  productNames: string;
  sheetDay: string;
  reason: string;
};

export function formatTemimaDayAr(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [year, month, day] = ymd.split("-");
  return `${Number(day)}-${Number(month)}-${year}`;
}

export function temimaCarrySheetTitle(fromYmd: string, toYmd: string) {
  if (!fromYmd || !toYmd) return "شيت مؤجلات مرحلة";
  return `شيت مؤجلات مرحلة من أسبوع ${formatTemimaDayAr(fromYmd)} إلى ${formatTemimaDayAr(toYmd)}`;
}

function ymdParts(ymd: string) {
  const [year, month, day] = ymd.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function addDaysYmd(ymd: string, days: number) {
  const parts = ymdParts(ymd);
  if (!parts) return ymd;
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function weekdayIndex(ymd: string) {
  const parts = ymdParts(ymd);
  if (!parts) return 0;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function sundayOnOrBefore(ymd: string) {
  return addDaysYmd(ymd, -weekdayIndex(ymd));
}

export function defaultSettlementRange() {
  const today = cairoTodayYmd();
  const sunday = sundayOnOrBefore(today);
  const start = sunday === today ? addDaysYmd(today, -7) : sunday;
  const saturday = addDaysYmd(start, 6);
  const end = saturday > today ? today : saturday;
  return { start, end: end < start ? start : end };
}

export function defaultSettlementWeekStart() {
  return defaultSettlementRange().start;
}

/** The week to close first: the previous Sunday–Saturday while it is still open. */
export function openWeekToClose(weeks: Array<{ weekStart: string; status: string }>) {
  const today = cairoTodayYmd();
  const thisSunday = sundayOnOrBefore(today);
  const previousSunday = addDaysYmd(thisSunday, -7);
  const previous = weeks.find((row) => row.weekStart === previousSunday);
  if (!previous || previous.status !== "closed") return previousSunday;
  return thisSunday;
}

function isYmd(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveSettlementRange(weekStartInput: string | undefined, weekEndInput: string | undefined, fallbackStart: string) {
  const start = isYmd(weekStartInput) ? weekStartInput : fallbackStart;
  const sunday = sundayOnOrBefore(start);
  const saturday = addDaysYmd(sunday, 6);
  let end = isYmd(weekEndInput)
    ? weekEndInput
    : isYmd(weekStartInput)
      ? start
      : saturday > cairoTodayYmd()
        ? cairoTodayYmd()
        : saturday;
  if (end < start) end = start;
  if (end > saturday) end = saturday;
  return { start, end, sunday, saturday, fullWeek: start === sunday && end === saturday };
}

function money(value: unknown) {
  const raw = String(value ?? "").trim();
  const n = Number(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return raw.startsWith("-") ? -n : n;
}

export function cashAmountOf(row: {
  customerSnapshot: unknown;
  depositAmount: unknown;
  depositPaid: boolean | null;
  depositApprovalStatus?: string | null;
  orderTotalDelta?: unknown;
  discountApprovalStatus?: string | null;
}) {
  const splitInput = sheetSplitFromConfirmation(row);
  if (splitInput.paymentState !== "cod") return 0;
  return sheetCollectedSplit(splitInput).net;
}

function settlementSplit(
  row: {
    customerSnapshot: unknown;
    depositAmount: unknown;
    depositPaid: boolean | null;
    depositApprovalStatus?: string | null;
    orderTotalDelta?: unknown;
    discountApprovalStatus?: string | null;
  },
  override: number | null,
  freshFawry: boolean,
  keepCancelledValue = false,
) {
  return sheetCollectedSplit(
    sheetSplitFromConfirmation({
      ...row,
      settlementDepositOverride: override,
      keepCancelledValue,
      freshPaymentState: freshFawry,
    }),
  );
}

function orderTotalOf(
  row: {
    customerSnapshot: unknown;
    depositAmount: unknown;
    depositPaid: boolean | null;
    depositApprovalStatus?: string | null;
    orderTotalDelta?: unknown;
    discountApprovalStatus?: string | null;
  },
  override: number | null,
  freshFawry: boolean,
) {
  const split = settlementSplit(row, override, freshFawry, true);
  return split.deposit + split.net;
}

async function depositOverrides(ids: number[]) {
  const prisma = getPrismaClient();
  const map = new Map<number, number | null>();
  if (!prisma) return map;
  const safe = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!safe.length) return map;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; settlementDepositOverride: unknown }>>(
    `SELECT id, settlementDepositOverride FROM CsOrderConfirmation WHERE id IN (${safe.join(",")})`,
  );
  for (const row of rows) {
    const amount = row.settlementDepositOverride == null ? null : Number(row.settlementDepositOverride);
    map.set(Number(row.id), amount != null && Number.isFinite(amount) ? amount : null);
  }
  return map;
}

function customerNameOf(snapshot: unknown) {
  const snap = snapshot as { customerName?: string } | null;
  return snap?.customerName || "—";
}

function snapshotText(snapshot: unknown, key: "phone" | "address" | "addressFull") {
  const snap = snapshot as Record<string, unknown> | null;
  const text = String(snap?.[key] || "").trim();
  return text && text !== "null" ? text : "";
}

function contactOf(snapshot: unknown) {
  return {
    phone: snapshotText(snapshot, "phone"),
    address: snapshotText(snapshot, "addressFull") || snapshotText(snapshot, "address"),
  };
}

const SHEET_DAY_SELECT = {
  shippingCompany: true,
  status: true,
  confirmedAt: true,
  confirmationEditedAt: true,
  shippingAssignedAt: true,
  handedToCarrier: true,
  handedToCarrierAt: true,
} as const;

function clockDayOf(value: Date | string | null | undefined) {
  if (!value) return "";
  const iso = value instanceof Date ? value.toISOString() : String(value);
  return cairoYmdFromIso(iso);
}

function fallbackSheetDay(
  order: {
    id: number;
    shippingCompany?: string | null;
    status?: string | null;
    confirmedAt?: Date | null;
    confirmationEditedAt?: Date | null;
    shippingAssignedAt?: Date | null;
    handedToCarrier?: boolean | null;
    handedToCarrierAt?: Date | null;
  } | null | undefined,
  cutoffs: Awaited<ReturnType<typeof listTemimaCutoffs>>,
  edits: Awaited<ReturnType<typeof listTemimaSheetEdits>>,
  from: string,
  to: string,
) {
  if (!order) return from;
  const day = sayedSheetYmd(order, cutoffs);
  if (day && day >= from && day <= to && !edits.some((edit) => edit.confirmationId === order.id && edit.dayYmd === day && edit.kind === "exclude")) {
    return day;
  }
  const include = edits.find(
    (edit) => edit.kind === "include" && edit.confirmationId === order.id && edit.dayYmd >= from && edit.dayYmd <= to,
  );
  if (include?.dayYmd) return include.dayYmd;
  const clocks = [clockDayOf(order.handedToCarrierAt), clockDayOf(order.confirmationEditedAt), clockDayOf(order.confirmedAt)];
  const inRange = clocks.find((ymd) => ymd >= from && ymd <= to);
  return inRange || from;
}

export type TemimaOrderSearchHit = {
  id: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
};

export async function searchTemimaSettlementOrders(rawQuery: string) {
  const prisma = getPrismaClient();
  const query = rawQuery.trim().slice(0, 80);
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة.", matches: [] as TemimaOrderSearchHit[] };
  if (query.length < 2) return { ok: true as const, matches: [] as TemimaOrderSearchHit[] };
  await ensureCsTables();
  const pattern = `%${query.replace(/[\\%_]/g, "")}%`;
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: number | bigint; wooOrderNumber: string; customerName: string | null; phone: string | null }>
  >(
    `SELECT id, wooOrderNumber,
      JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.customerName')) AS customerName,
      JSON_UNQUOTE(JSON_EXTRACT(customerSnapshot, '$.phone')) AS phone
     FROM CsOrderConfirmation
     WHERE wooOrderNumber LIKE ? OR CAST(customerSnapshot AS CHAR) LIKE ?
     ORDER BY id DESC
     LIMIT 20`,
    pattern,
    pattern,
  );
  return {
    ok: true as const,
    matches: rows.map((row) => ({
      id: Number(row.id),
      wooOrderNumber: String(row.wooOrderNumber || ""),
      customerName: String(row.customerName || "").trim() === "null" ? "" : String(row.customerName || "").trim(),
      phone: String(row.phone || "").trim() === "null" ? "" : String(row.phone || "").trim(),
    })),
  };
}

function productNamesOf(snapshot: unknown) {
  const snap = snapshot as { items?: Array<{ name?: string; quantity?: number }> } | null;
  const items = snap?.items || [];
  const names = items
    .map((line) => {
      const name = String(line.name || "").trim();
      if (!name) return "";
      const qty = typeof line.quantity === "number" && line.quantity > 1 ? ` × ${line.quantity}` : "";
      return `${name}${qty}`;
    })
    .filter(Boolean);
  return names.length ? names.join(" · ") : "—";
}

async function loadWeeks() {
  const prisma = getPrismaClient();
  if (!prisma) return [];
  return prisma.csCarrierWeek.findMany({
    where: { carrierCompany: TEMIMA_COMPANY },
    include: { lines: true },
    orderBy: { weekStart: "desc" },
  });
}

function weekYmd(value: Date) {
  return cairoYmdFromIso(value.toISOString());
}

function carryKeyOf(week: { carryKey?: number | null }) {
  return Number(week.carryKey || 0);
}

function isCarryDayWeek(week: { carryKey?: number | null }) {
  return carryKeyOf(week) !== 0;
}

function regularWeekLookup(start: Date) {
  return {
    carrierCompany_weekStart_carryKey: {
      carrierCompany: TEMIMA_COMPANY,
      weekStart: start,
      carryKey: 0,
    },
  };
}

function refusalReasonOf(row: {
  courierOutcome?: string | null;
  courierRefusalReason?: string | null;
}) {
  if (String(row.courierOutcome || "") === "refused") {
    const detail = String(row.courierRefusalReason || "").trim();
    return detail ? `رفض استلام · ${detail}` : "رفض استلام";
  }
  return "الغاء الشيت";
}

export async function listTemimaCarryForward(): Promise<TemimaCarryForward> {
  const prisma = getPrismaClient();
  if (!prisma) return { fromYmd: "", toYmd: "", confirmationIds: [] };
  await ensureCsTables();
  const weeks = await loadWeeks();
  const closed = weeks.filter((row) => row.status === "closed");
  const latest = closed[0];
  if (!latest) return { fromYmd: "", toYmd: "", confirmationIds: [] };

  const settled = new Set<number>();
  for (const week of weeks) {
    for (const line of week.lines) {
      if (line.disposition === "collect" || line.disposition === "return") {
        settled.add(line.confirmationId);
      }
    }
  }

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const week of closed) {
    for (const line of week.lines) {
      if (line.disposition !== "postpone" || settled.has(line.confirmationId) || seen.has(line.confirmationId)) continue;
      seen.add(line.confirmationId);
      ids.push(line.confirmationId);
    }
  }
  return {
    fromYmd: weekYmd(latest.weekStart),
    toYmd: weekYmd(latest.weekEnd),
    confirmationIds: ids,
  };
}

async function reopenAllTemimaWeeks() {
  const prisma = getPrismaClient();
  if (!prisma) return;
  await prisma.csCarrierWeek.updateMany({
    where: { carrierCompany: TEMIMA_COMPANY, carryKey: 0, status: "closed" },
    data: { status: "open", closedAt: null },
  });
}

export async function getTemimaWeekSheet(weekStartInput?: string, weekEndInput?: string, _agentId = 0) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  try {
    await ensureCsTables();
    try {
      await reopenAllTemimaWeeks();
    } catch (error) {
      console.warn("[temima-settlement] reopen weeks skipped", error instanceof Error ? error.message : error);
    }

  const weeks = await loadWeeks();
  const range = resolveSettlementRange(
    weekStartInput,
    weekEndInput,
    openWeekToClose(
      weeks
        .filter((row) => !isCarryDayWeek(row))
        .map((row) => ({
          weekStart: cairoYmdFromIso(row.weekStart.toISOString()),
          status: row.status,
        })),
    ),
  );
  const { sunday } = range;
  const week =
    weeks.find((row) => cairoYmdFromIso(row.weekStart.toISOString()) === sunday && !isCarryDayWeek(row)) || null;

  const resolvedPostponeIds = new Set<number>();
  for (const item of weeks) {
    if (item.status !== "closed") continue;
    for (const line of item.lines) {
      if (line.resolvesLineId) resolvedPostponeIds.add(line.resolvesLineId);
    }
  }

  const openPostpones: Array<{
    lineId: number;
    confirmationId: number;
    wooOrderNumber: string;
    cashAmount: number;
    isLarge: boolean;
    fromYmd: string;
    toYmd: string;
  }> = [];
  const seenCarry = new Set<number>();
  for (const item of weeks) {
    if (item.status !== "closed" || isCarryDayWeek(item)) continue;
    if (week && item.id === week.id) continue;
    for (const line of item.lines) {
      if (line.disposition === "postpone") {
        if (!resolvedPostponeIds.has(line.id) && !seenCarry.has(line.confirmationId)) {
          seenCarry.add(line.confirmationId);
          openPostpones.push({
            lineId: line.id,
            confirmationId: line.confirmationId,
            wooOrderNumber: line.wooOrderNumber,
            cashAmount: Number(line.cashAmount),
            isLarge: line.isLarge,
            fromYmd: weekYmd(item.weekStart),
            toYmd: weekYmd(item.weekEnd),
          });
        }
        continue;
      }
    }
  }

  const overlappingWeeks = weeks.filter((item) => {
    if (isCarryDayWeek(item)) return false;
    const from = cairoYmdFromIso(item.weekStart.toISOString());
    const to = cairoYmdFromIso(item.weekEnd.toISOString());
    return from <= range.end && to >= range.start;
  });
  const days = await listSettlementSheetDayMap(range.start, range.end);
  const weekLineIds = overlappingWeeks.flatMap((item) =>
    item.lines.filter((line) => !line.resolvesLineId).map((line) => line.confirmationId),
  );
  const sheetIds = [...new Set([...days.keys(), ...weekLineIds])];
  const sheetIdSet = new Set(sheetIds);
  const carryIds = range.fullWeek
    ? openPostpones.map((row) => row.confirmationId).filter((id) => !sheetIdSet.has(id))
    : [];
  const orderIds = [...sheetIds, ...carryIds];
  const orders = orderIds.length
    ? await prisma.csOrderConfirmation.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          wooOrderNumber: true,
          customerSnapshot: true,
          depositAmount: true,
          depositPaid: true,
          depositApprovalStatus: true,
          orderTotalDelta: true,
          discountApprovalStatus: true,
          createdAt: true,
          courierOutcome: true,
          courierRefusalReason: true,
          ...SHEET_DAY_SELECT,
        },
      })
    : [];
  const orderById = new Map(orders.map((row) => [row.id, row]));

  const draft = new Map(overlappingWeeks.flatMap((item) => item.lines.map((line) => [line.confirmationId, line] as const)));
  if (week) {
    for (const line of week.lines) {
      if (!draft.has(line.confirmationId)) draft.set(line.confirmationId, line);
    }
  }
  const overrides = await depositOverrides(orderIds);
  const cutoffs = await listTemimaCutoffs();
  const edits = await listTemimaSheetEdits();

  const rows: TemimaSheetRow[] = [];
  for (const id of sheetIds) {
    const order = orderById.get(id);
    const saved = draft.get(id);
    if (!order && !saved) continue;
    if (saved?.resolvesLineId) continue;
    const snap = (order?.customerSnapshot || {}) as { total?: string; paymentMethod?: string; paymentMethodId?: string | null };
    const override = overrides.get(id) ?? null;
    const split = order ? settlementSplit(order, override, true, true) : { net: Number(saved?.cashAmount || 0), deposit: 0 };
    const disposition = storedDisposition(saved?.disposition);
    const sheetDay =
      days.get(id) ||
      (order ? fallbackSheetDay(order, cutoffs, edits, range.start, range.end) : "") ||
      range.start;
    rows.push({
      confirmationId: id,
      wooOrderNumber: order?.wooOrderNumber || saved?.wooOrderNumber || "",
      customerName: order ? customerNameOf(order.customerSnapshot) : "—",
      productNames: order ? productNamesOf(order.customerSnapshot) : "—",
      ...(order ? contactOf(order.customerSnapshot) : { phone: "", address: "" }),
      cashAmount: split.net,
      depositAmount: order ? split.deposit : 0,
      orderTotal: order ? split.deposit + split.net : Number(saved?.cashAmount || 0),
      fawry: isFawryMethod(snap.paymentMethod, snap.paymentMethodId),
      disposition,
      isLarge: saved?.isLarge || false,
      carried: false,
      carryLocked: false,
      postponeLineId: null,
      sheetDay,
      refusalReason: disposition === "return" ? refusalReasonOf(order || {}) : undefined,
    });
  }

  if (range.fullWeek) {
    for (const carried of openPostpones) {
      if (sheetIdSet.has(carried.confirmationId)) continue;
      const saved = draft.get(carried.confirmationId);
      const order = orderById.get(carried.confirmationId);
      const snap = (order?.customerSnapshot || {}) as { total?: string; paymentMethod?: string; paymentMethodId?: string | null };
      const override = overrides.get(carried.confirmationId) ?? null;
      const disposition = (saved?.disposition as TemimaDisposition) || "postpone";
      rows.push({
        confirmationId: carried.confirmationId,
        wooOrderNumber: carried.wooOrderNumber,
        customerName: order ? customerNameOf(order.customerSnapshot) : "—",
        productNames: order ? productNamesOf(order.customerSnapshot) : "—",
        ...(order ? contactOf(order.customerSnapshot) : { phone: "", address: "" }),
        cashAmount: carried.cashAmount,
        depositAmount: order ? settlementSplit(order, override, true).deposit : 0,
        orderTotal: order ? orderTotalOf(order, override, true) : money(snap.total),
        fawry: isFawryMethod(snap.paymentMethod, snap.paymentMethodId),
        disposition,
        isLarge: saved?.isLarge ?? carried.isLarge,
        carried: true,
        carryLocked: disposition === "collect" || disposition === "return",
        postponeLineId: carried.lineId,
        sheetDay: "",
        carryFromStart: carried.fromYmd,
        carryFromEnd: carried.toYmd,
        refusalReason: disposition === "return" ? refusalReasonOf(order || {}) : undefined,
      });
    }
  }

  rows.sort((a, b) => Number(b.wooOrderNumber) - Number(a.wooOrderNumber));
  const due = collectDueBreakdown(rows);

  return {
    ok: true as const,
    weekStart: range.start,
    weekEnd: range.end,
    fullWeek: range.fullWeek,
    status: "open" as const,
    cashDue: due.cashDue,
    weekCollectDue: due.weekCollectDue,
    priorPostponeCollectDue: due.priorPostponeCollectDue,
    priorPostponeCollectedOrders: due.priorPostponeCollectedOrders,
    cashPaid: week ? Number(week.cashPaid) : 0,
    monthId: week?.monthId ?? null,
    rows,
    refusals: refusalRowsOf(rows),
    history: historyOf(weeks),
  };
  } catch (error) {
    console.error("[temima-settlement] sheet failed", error instanceof Error ? error.message : error);
    return { ok: false as const, message: "تعذر تحميل شيت التصفية." };
  }
}

function refusalRowsOf(rows: TemimaSheetRow[]): TemimaRefusalRow[] {
  return rows
    .filter((row) => row.disposition === "return" && !row.carried)
    .map((row) => ({
      confirmationId: row.confirmationId,
      wooOrderNumber: row.wooOrderNumber,
      customerName: row.customerName,
      phone: row.phone,
      productNames: row.productNames,
      sheetDay: row.sheetDay,
      reason: row.refusalReason || "الغاء الشيت",
    }))
    .sort((a, b) => Number(String(b.wooOrderNumber).replace(/\D/g, "")) - Number(String(a.wooOrderNumber).replace(/\D/g, "")));
}

function collectDueBreakdown(rows: TemimaSheetRow[]) {
  let weekCollectDue = 0;
  let priorPostponeCollectDue = 0;
  const priorPostponeCollectedOrders: string[] = [];
  for (const row of rows) {
    if (row.disposition !== "collect") continue;
    if (row.carried) {
      priorPostponeCollectDue += row.cashAmount;
      priorPostponeCollectedOrders.push(row.wooOrderNumber);
    } else {
      weekCollectDue += row.cashAmount;
    }
  }
  priorPostponeCollectedOrders.sort((a, b) => Number(b.replace(/\D/g, "")) - Number(a.replace(/\D/g, "")));
  return {
    weekCollectDue,
    priorPostponeCollectDue,
    priorPostponeCollectedOrders,
    cashDue: weekCollectDue + priorPostponeCollectDue,
  };
}

function historyOf(
  weeks: Array<{
    weekStart: Date;
    weekEnd: Date;
    status: string;
    cashDue: unknown;
    cashPaid: unknown;
    monthId: number | null;
    carryKey?: number | null;
  }>,
) {
  return weeks.slice(0, 12).map((row) => ({
    weekStart: cairoYmdFromIso(row.weekStart.toISOString()),
    weekEnd: cairoYmdFromIso(row.weekEnd.toISOString()),
    status: row.status,
    cashDue: Number(row.cashDue),
    cashPaid: Number(row.cashPaid),
    inMonth: Boolean(row.monthId),
    carryDay: isCarryDayWeek(row),
  }));
}

async function upsertOpenWeek(sunday: string, endYmd: string, agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const start = cairoYmdBounds(sunday)?.start;
  const end = cairoYmdBounds(endYmd)?.start;
  if (!start || !end) return null;
  const existing = await prisma.csCarrierWeek.findUnique({
    where: regularWeekLookup(start),
  });
  if (existing?.status === "closed") return existing;
  if (existing) {
    if (cairoYmdFromIso(existing.weekEnd.toISOString()) === endYmd) return existing;
    return prisma.csCarrierWeek.update({ where: { id: existing.id }, data: { weekEnd: end } });
  }
  return prisma.csCarrierWeek.create({
    data: {
      carrierCompany: TEMIMA_COMPANY,
      weekStart: start,
      weekEnd: end,
      status: "open",
      closedById: agentId,
      carryKey: 0,
    },
  });
}

async function refreshWeekCashDue(weekId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const lines = await prisma.csCarrierWeekLine.findMany({ where: { weekId } });
  const cashDue = lines
    .filter((row) => row.disposition === "collect")
    .reduce((sum, row) => sum + Number(row.cashAmount || 0), 0);
  await prisma.csCarrierWeek.update({ where: { id: weekId }, data: { cashDue } });
}

async function upsertCarryDayWeek(lockYmd: string, agentId: number) {
  const prisma = getPrismaClient();
  const start = cairoYmdBounds(lockYmd)?.start;
  if (!prisma || !start) return null;
  const existing = await prisma.csCarrierWeek.findUnique({
    where: {
      carrierCompany_weekStart_carryKey: {
        carrierCompany: TEMIMA_COMPANY,
        weekStart: start,
        carryKey: CARRY_DAY_KEY,
      },
    },
  });
  if (existing) return existing;
  return prisma.csCarrierWeek.create({
    data: {
      carrierCompany: TEMIMA_COMPANY,
      weekStart: start,
      weekEnd: start,
      status: "closed",
      closedById: agentId,
      closedAt: new Date(),
      carryKey: CARRY_DAY_KEY,
    },
  });
}

async function lockResolvedCarryLines(agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const carryWeek = await upsertCarryDayWeek(cairoTodayYmd(), agentId);
  if (!carryWeek) return;
  const sources = await prisma.csCarrierWeek.findMany({
    where: {
      carrierCompany: TEMIMA_COMPANY,
      carryKey: 0,
      OR: [{ status: "open" }, { status: "closed", monthId: null }],
    },
    include: { lines: true },
  });
  const moveIds: number[] = [];
  const touched = new Set<number>([carryWeek.id]);
  for (const week of sources) {
    if (week.id === carryWeek.id) continue;
    for (const line of week.lines) {
      if (!line.resolvesLineId) continue;
      if (line.disposition !== "collect" && line.disposition !== "return") continue;
      moveIds.push(line.id);
      touched.add(week.id);
    }
  }
  if (!moveIds.length) return;
  await prisma.csCarrierWeekLine.updateMany({
    where: { id: { in: moveIds } },
    data: { weekId: carryWeek.id },
  });
  for (const weekId of touched) await refreshWeekCashDue(weekId);
}

function linePayload(weekId: number, row: TemimaSheetRow) {
  const disposition = storedDisposition(row.disposition);
  return {
    weekId,
    confirmationId: row.confirmationId,
    wooOrderNumber: row.wooOrderNumber,
    disposition,
    cashAmount: row.cashAmount,
    isLarge: disposition === "collect" ? row.isLarge : false,
    resolvesLineId: row.carried && disposition && disposition !== "postpone" ? row.postponeLineId : null,
  };
}

export async function markTemimaLarge(confirmationId: number, isLarge: boolean) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!Number.isInteger(confirmationId) || confirmationId <= 0) {
    return { ok: false as const, message: "الأوردر غير موجود." };
  }
  await ensureCsTables();
  const changed = await prisma.csCarrierWeekLine.updateMany({
    where: {
      confirmationId,
      disposition: "collect",
      week: {
        carrierCompany: TEMIMA_COMPANY,
        OR: [{ status: "open" }, { carryKey: { not: 0 }, monthId: null }],
      },
    },
    data: { isLarge },
  });
  if (!changed.count) return { ok: false as const, message: "كبير يتسجل مع تم بنجاح فقط." };
  return { ok: true as const, isLarge };
}

function editedLineRows(rows: TemimaSheetRow[]) {
  const byId = new Map<number, TemimaSheetRow>();
  for (const row of rows) {
    if (!Number.isInteger(row.confirmationId) || row.confirmationId <= 0) continue;
    byId.set(row.confirmationId, row);
  }
  return [...byId.values()];
}

export async function saveTemimaWeek(input: {
  weekStart: string;
  weekEnd?: string;
  cashPaid: number;
  rows: TemimaSheetRow[];
  agentId: number;
  close: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();

  const range = resolveSettlementRange(input.weekStart, input.weekEnd, sundayOnOrBefore(input.weekStart || cairoTodayYmd()));
  if (input.close && !range.fullWeek) {
    return { ok: false as const, message: "قفل الأسبوع للأسبوع كامل من الأحد للسبت، وبالطلب." };
  }
  const week = await upsertOpenWeek(range.sunday, range.saturday, input.agentId);
  if (!week) return { ok: false as const, message: "تعذر فتح الأسبوع." };
  if (week.status === "closed") return { ok: false as const, message: "هذا الأسبوع مقفل." };

  const edited = editedLineRows(input.rows);
  if (edited.length) {
    await prisma.csCarrierWeekLine.deleteMany({
      where: { weekId: week.id, confirmationId: { in: edited.map((row) => row.confirmationId) } },
    });
    const marked = edited.filter((row) => storedDisposition(row.disposition));
    if (marked.length) {
      await prisma.csCarrierWeekLine.createMany({ data: marked.map((row) => linePayload(week.id, row)) });
      for (const row of marked) {
        const disposition = storedDisposition(row.disposition);
        if (!disposition) continue;
        await prisma.$executeRaw`
          UPDATE CsOrderConfirmation SET temimaSupervisorResult = ${disposition} WHERE id = ${row.confirmationId}
        `;
      }
    }
  }

  await lockResolvedCarryLines(input.agentId);

  if (input.close) {
    const live = await getTemimaWeekSheet(range.sunday, range.saturday, input.agentId);
    if (!live.ok) return live;
    const snapshotRows = live.rows.map((row) =>
      !row.carried && !storedDisposition(row.disposition) ? { ...row, disposition: "postpone" as const } : row,
    );
    const emptyIds = live.rows
      .filter((row) => !row.carried && !storedDisposition(row.disposition))
      .map((row) => row.confirmationId);
    if (emptyIds.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE CsOrderConfirmation
         SET temimaSupervisorResult = 'postpone'
         WHERE id IN (${emptyIds.map(() => "?").join(", ")})
           AND (temimaSupervisorResult IS NULL OR temimaSupervisorResult = '')`,
        ...emptyIds,
      );
    }
    await prisma.csCarrierWeekLine.deleteMany({ where: { weekId: week.id } });
    const marked = snapshotRows.filter((row) => storedDisposition(row.disposition) && !row.carried);
    if (marked.length) {
      await prisma.csCarrierWeekLine.createMany({ data: marked.map((row) => linePayload(week.id, row)) });
    }
    await lockResolvedCarryLines(input.agentId);
  }

  const storedLines = await prisma.csCarrierWeekLine.findMany({ where: { weekId: week.id } });
  const cashDue = storedLines
    .filter((row) => row.disposition === "collect")
    .reduce((sum, row) => sum + Number(row.cashAmount || 0), 0);

  await prisma.csCarrierWeek.update({
    where: { id: week.id },
    data: {
      cashDue,
      cashPaid: Math.max(0, Number(input.cashPaid) || 0),
      status: input.close ? "closed" : "open",
      closedAt: input.close ? new Date() : null,
      closedById: input.agentId,
    },
  });

  return { ok: true as const, cashDue };
}

export async function openSettlementMarks(ids: number[]) {
  const prisma = getPrismaClient();
  const map = new Map<number, TemimaDisposition>();
  if (!prisma || !ids.length) return map;
  const safe = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!safe.length) return map;
  await ensureCsTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ confirmationId: number; disposition: string }>>(
    `SELECT id AS confirmationId, temimaSupervisorResult AS disposition
     FROM CsOrderConfirmation
     WHERE temimaSupervisorResult IN ('collect', 'return', 'postpone')
       AND id IN (${safe.join(",")})`,
  );
  for (const row of rows) {
    if (row.disposition === "collect" || row.disposition === "return" || row.disposition === "postpone") {
      map.set(Number(row.confirmationId), row.disposition);
    }
  }
  return map;
}

export async function closedTemimaWeekIds(ids: number[]) {
  const prisma = getPrismaClient();
  const closed = new Set<number>();
  if (!prisma || !ids.length) return closed;
  const safe = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!safe.length) return closed;
  await ensureCsTables();
  const cutoffs = await listTemimaCutoffs();
  const orders = await prisma.csOrderConfirmation.findMany({
    where: { id: { in: safe } },
    select: { id: true, ...SHEET_DAY_SELECT },
  });
  const sundayById = new Map<number, string>();
  for (const order of orders) {
    const day = sayedSheetYmd(order, cutoffs);
    if (day) sundayById.set(order.id, sundayOnOrBefore(day));
  }
  const starts = [...new Set(sundayById.values())]
    .map((ymd) => cairoYmdBounds(ymd)?.start)
    .filter((value): value is Date => Boolean(value));
  if (!starts.length) return closed;
  const weeks = await prisma.csCarrierWeek.findMany({
    where: { carrierCompany: TEMIMA_COMPANY, status: "closed", weekStart: { in: starts } },
    select: { weekStart: true },
  });
  const closedSundays = new Set(weeks.map((week) => cairoYmdFromIso(week.weekStart.toISOString())));
  for (const [id, sunday] of sundayById) {
    if (closedSundays.has(sunday)) closed.add(id);
  }
  return closed;
}

export async function applySupervisorOrderResult(input: {
  confirmationId: number;
  result: "delivered" | "returned" | "postponed";
  agentId: number;
  allowClosed?: boolean;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!Number.isInteger(input.confirmationId)) return { ok: false as const, message: "الأوردر غير موجود." };
  await ensureCsTables();
  const order = await prisma.csOrderConfirmation.findFirst({
    where: { id: input.confirmationId, status: "CONFIRMED", shippingCompany: TEMIMA_COMPANY },
    select: {
      id: true,
      wooOrderNumber: true,
      customerSnapshot: true,
      depositAmount: true,
      depositPaid: true,
      depositApprovalStatus: true,
      orderTotalDelta: true,
      discountApprovalStatus: true,
      ...SHEET_DAY_SELECT,
    },
  });
  if (!order) return { ok: false as const, message: "الأوردر مش على شيت سيد تميمة." };

  const priorMark = await prisma.$queryRawUnsafe<Array<{ disposition: string | null }>>(
    `SELECT temimaSupervisorResult AS disposition FROM CsOrderConfirmation WHERE id = ${order.id} LIMIT 1`,
  );
  const currentMark = storedDisposition(priorMark[0]?.disposition);
  const disposition: TemimaDisposition =
    input.result === "returned" ? "return" : input.result === "postponed" ? "postpone" : "collect";
  if (
    !input.allowClosed &&
    (currentMark === "collect" || currentMark === "return") &&
    disposition === "postpone"
  ) {
    return { ok: false as const, message: "تم بنجاح والغاء يتعدلوا لبعض. مؤجل مش متاح من الواجهة." };
  }
  const convertingPostpone =
    currentMark === "postpone" && (disposition === "collect" || disposition === "return");

  let openPostponeId: number | null = null;
  if (!convertingPostpone) {
    const closedPostpones = await prisma.csCarrierWeekLine.findMany({
      where: {
        confirmationId: order.id,
        disposition: "postpone",
        week: { carrierCompany: TEMIMA_COMPANY, status: "closed" },
      },
      select: { id: true },
    });
    const resolved = closedPostpones.length
      ? await prisma.csCarrierWeekLine.findMany({
          where: { resolvesLineId: { in: closedPostpones.map((line) => line.id) } },
          select: { resolvesLineId: true },
        })
      : [];
    const resolvedIds = new Set(resolved.map((line) => line.resolvesLineId));
    openPostponeId = closedPostpones.find((line) => !resolvedIds.has(line.id))?.id ?? null;
  }

  const cutoffs = await listTemimaCutoffs();
  const sheetDay = sayedSheetYmd(order, cutoffs) || clockDayOf(order.confirmedAt) || cairoTodayYmd();
  const sheetSunday = sundayOnOrBefore(sheetDay);
  const targetSunday = convertingPostpone
    ? sheetSunday
    : openPostponeId
      ? sundayOnOrBefore(cairoTodayYmd())
      : sheetSunday;
  const targetSaturday = addDaysYmd(targetSunday, 6);
  const week = await upsertOpenWeek(targetSunday, targetSaturday, input.agentId);
  if (!week) return { ok: false as const, message: "تعذر فتح الأسبوع." };
  const weekClosed = week.status === "closed";
  if (weekClosed && !input.allowClosed && !convertingPostpone) {
    return { ok: false as const, message: "الأسبوع مقفل." };
  }

  const overrides = await depositOverrides([order.id]);
  const split = settlementSplit(order, overrides.get(order.id) ?? null, true, true);
  const existing = await prisma.csCarrierWeekLine.findFirst({
    where: { weekId: week.id, confirmationId: order.id },
    select: { isLarge: true },
  });

  if (convertingPostpone) {
    const extras = await prisma.csCarrierWeekLine.findMany({
      where: { confirmationId: order.id, NOT: { weekId: week.id } },
      select: { weekId: true },
    });
    await prisma.csCarrierWeekLine.deleteMany({
      where: { confirmationId: order.id, NOT: { weekId: week.id } },
    });
    for (const weekId of new Set(extras.map((row) => row.weekId))) {
      await refreshWeekCashDue(weekId);
    }
  }

  await prisma.csCarrierWeekLine.deleteMany({ where: { weekId: week.id, confirmationId: order.id } });
  await prisma.csCarrierWeekLine.create({
    data: {
      weekId: week.id,
      confirmationId: order.id,
      wooOrderNumber: order.wooOrderNumber,
      disposition,
      cashAmount: split.net,
      isLarge: disposition === "collect" ? Boolean(existing?.isLarge) : false,
      resolvesLineId: convertingPostpone ? null : disposition !== "postpone" ? openPostponeId : null,
    },
  });

  const storedLines = await prisma.csCarrierWeekLine.findMany({ where: { weekId: week.id } });
  const cashDue = storedLines
    .filter((row) => row.disposition === "collect")
    .reduce((sum, row) => sum + Number(row.cashAmount || 0), 0);
  await prisma.csCarrierWeek.update({
    where: { id: week.id },
    data: weekClosed ? { cashDue } : { cashDue, status: "open", closedAt: null },
  });
  await prisma.$executeRaw`
    UPDATE CsOrderConfirmation
    SET temimaSupervisorResult = ${disposition}
    WHERE id = ${order.id}
  `;
  await captureDeskReturnFromConfirmation(order.id);
  if (!convertingPostpone) await lockResolvedCarryLines(input.agentId);

  return { ok: true as const, result: input.result, disposition };
}

export async function setFawrySettlementDeposit(input: { confirmationId: number; amount: number | null }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!Number.isInteger(input.confirmationId)) return { ok: false as const, message: "الأوردر غير موجود." };
  await ensureCsTables();
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: input.confirmationId },
    select: {
      id: true,
      customerSnapshot: true,
      depositAmount: true,
      depositPaid: true,
      depositApprovalStatus: true,
      orderTotalDelta: true,
      discountApprovalStatus: true,
    },
  });
  if (!row) return { ok: false as const, message: "الأوردر غير موجود." };
  const snap = (row.customerSnapshot || {}) as { paymentMethod?: string; paymentMethodId?: string | null; total?: string };
  if (!isFawryMethod(snap.paymentMethod, snap.paymentMethodId)) {
    return { ok: false as const, message: "التعديل لأوردرات فوري فقط." };
  }
  const closed = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT l.id AS id
    FROM CsCarrierWeekLine l
    INNER JOIN CsCarrierWeek w ON w.id = l.weekId
    WHERE l.confirmationId = ${input.confirmationId}
      AND w.status = 'closed'
      AND w.carrierCompany = ${TEMIMA_COMPANY}
      AND w.carryKey = 0
    LIMIT 1
  `;
  if (closed.length) return { ok: false as const, message: "الأسبوع مقفل." };
  const total = orderTotalOf(row, null, true);
  if (total < 0) {
    return { ok: true as const, depositAmount: 0, cashAmount: total };
  }
  const amount =
    input.amount == null || !Number.isFinite(input.amount) ? null : Math.min(total, Math.max(0, input.amount));
  if (amount == null) {
    await prisma.$executeRaw`
      UPDATE CsOrderConfirmation SET settlementDepositOverride = NULL WHERE id = ${input.confirmationId}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE CsOrderConfirmation SET settlementDepositOverride = ${amount} WHERE id = ${input.confirmationId}
    `;
  }
  const deposit = amount == null ? null : amount;
  return { ok: true as const, depositAmount: deposit, cashAmount: deposit == null ? null : Math.max(0, total - deposit) };
}

export async function previewTemimaMonth(closeDateInput?: string) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();
  const closeDate = closeDateInput || cairoTodayYmd();
  const end = cairoYmdBounds(closeDate)?.endExclusive;
  if (!end) return { ok: false as const, message: "تاريخ غير صالح." };

  const weeks = await prisma.csCarrierWeek.findMany({
    where: {
      carrierCompany: TEMIMA_COMPANY,
      status: "closed",
      monthId: null,
      weekEnd: { lt: end },
    },
    include: { lines: true },
    orderBy: { weekStart: "asc" },
  });

  let orders = 0;
  let shippingTotal = 0;
  for (const week of weeks) {
    for (const line of week.lines) {
      if (line.disposition !== "collect") continue;
      orders += 1;
      shippingTotal += line.isLarge ? FEE_LARGE : FEE_NORMAL;
    }
  }

  return {
    ok: true as const,
    closeDate,
    weeks: weeks.map((week) => ({
      weekStart: cairoYmdFromIso(week.weekStart.toISOString()),
      weekEnd: cairoYmdFromIso(week.weekEnd.toISOString()),
      cashPaid: Number(week.cashPaid),
      carryDay: isCarryDayWeek(week),
    })),
    deliveredOrders: orders,
    shippingTotal,
  };
}

export async function closeTemimaMonth(input: { closeDate: string; shippingPaid: number; agentId: number }) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const preview = await previewTemimaMonth(input.closeDate);
  if (!preview.ok) return preview;
  if (preview.weeks.length === 0) {
    return { ok: false as const, message: "لا توجد أسابيع مقفلة جاهزة لهذا التاريخ." };
  }
  const end = cairoYmdBounds(input.closeDate);
  if (!end) return { ok: false as const, message: "تاريخ غير صالح." };

  const month = await prisma.csCarrierMonth.create({
    data: {
      carrierCompany: TEMIMA_COMPANY,
      closeDate: end.start,
      shippingTotal: preview.shippingTotal,
      shippingPaid: Math.max(0, Number(input.shippingPaid) || 0),
      closedById: input.agentId,
      closedAt: new Date(),
    },
  });

  await prisma.csCarrierWeek.updateMany({
    where: {
      carrierCompany: TEMIMA_COMPANY,
      status: "closed",
      monthId: null,
      weekEnd: { lt: end.endExclusive },
    },
    data: { monthId: month.id },
  });

  return { ok: true as const, shippingTotal: preview.shippingTotal, weeks: preview.weeks.length };
}
