import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import {
  isFawryMethod,
  sheetCollectedSplit,
  sheetSplitFromConfirmation,
} from "@/lib/cs/order-window";
import { cairoTodayYmd, cairoYmdBounds, cairoYmdFromIso } from "@/lib/cs/order-window";
import { listTemimaSheetEdits, sayedSheetDayMap } from "@/lib/cs/temima-sheet-edits";
import { sayedSheetYmd } from "@/lib/cs/temima-sheet";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { captureDeskReturnFromConfirmation } from "@/lib/cs/bosta-return-capture";
import { LATE_FROM_YMD } from "@/lib/cs/temima-late";
import { getPrismaClient } from "@/lib/db";

export const TEMIMA_COMPANY = "sayed_temima";
const FEE_NORMAL = 75;
const FEE_LARGE = 100;

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

function addDaysYmd(ymd: string, days: number) {
  const bounds = cairoYmdBounds(ymd);
  if (!bounds) return ymd;
  return cairoYmdFromIso(new Date(bounds.start.getTime() + days * 24 * 60 * 60 * 1000).toISOString());
}

function weekdayIndex(ymd: string) {
  const bounds = cairoYmdBounds(ymd);
  if (!bounds) return 0;
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "short",
  }).format(bounds.start);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[label] ?? 0;
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

/** Finished Sunday–Saturday weeks from the Temima start day, never including the week that contains today. */
export function completedTemimaSundaysToClose(fromYmd: string, today = cairoTodayYmd()) {
  const currentSunday = sundayOnOrBefore(today);
  let sunday = sundayOnOrBefore(fromYmd);
  const out: string[] = [];
  while (sunday && sunday < currentSunday) {
    const saturday = addDaysYmd(sunday, 6);
    if (saturday >= today) break;
    out.push(sunday);
    sunday = addDaysYmd(sunday, 7);
  }
  return out;
}

let ensuringClosedWeeks = false;

async function ensureClosedTemimaWeeksFrom(fromYmd: string, agentId: number) {
  if (ensuringClosedWeeks) return;
  ensuringClosedWeeks = true;
  try {
    const prisma = getPrismaClient();
    if (!prisma) return;
    await ensureCsTables();
    const closer =
      agentId > 0
        ? agentId
        : ((await prisma.csAgent.findFirst({ where: { isActive: true }, select: { id: true } }))?.id || 0);
    if (!closer) return;
    for (const sunday of completedTemimaSundaysToClose(fromYmd)) {
      const saturday = addDaysYmd(sunday, 6);
      const start = cairoYmdBounds(sunday)?.start;
      if (!start) continue;
      const existing = await prisma.csCarrierWeek.findUnique({
        where: { carrierCompany_weekStart: { carrierCompany: TEMIMA_COMPANY, weekStart: start } },
      });
      if (existing?.status === "closed") continue;
      const closed = await saveTemimaWeek({
        weekStart: sunday,
        weekEnd: saturday,
        cashPaid: existing ? Number(existing.cashPaid) : 0,
        rows: [],
        agentId: closer,
        close: true,
      });
      if (!closed.ok) console.error("[temima-settlement] backfill close failed", sunday, closed.message);
    }
  } finally {
    ensuringClosedWeeks = false;
  }
}

function isYmd(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveSettlementRange(weekStartInput: string | undefined, weekEndInput: string | undefined, fallbackStart: string) {
  const start = isYmd(weekStartInput) ? weekStartInput : fallbackStart;
  const sunday = sundayOnOrBefore(start);
  const saturday = addDaysYmd(sunday, 6);
  let end = isYmd(weekEndInput) ? weekEndInput : isYmd(weekStartInput) ? start : saturday > cairoTodayYmd() ? cairoTodayYmd() : saturday;
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

async function sheetDayById(from: string, to: string) {
  return sayedSheetDayMap(from, to);
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
  if (!order) return "";
  const day = sayedSheetYmd(order, cutoffs);
  if (day && day >= from && day <= to && !edits.some((edit) => edit.confirmationId === order.id && edit.dayYmd === day && edit.kind === "exclude")) {
    return day;
  }
  const include = edits.find(
    (edit) => edit.kind === "include" && edit.confirmationId === order.id && edit.dayYmd >= from && edit.dayYmd <= to,
  );
  return include?.dayYmd || "";
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

export async function getTemimaWeekSheet(weekStartInput?: string, weekEndInput?: string, agentId = 0) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  await ensureCsTables();
  await ensureClosedTemimaWeeksFrom(LATE_FROM_YMD, agentId);

  const weeks = await loadWeeks();
  const range = resolveSettlementRange(
    weekStartInput,
    weekEndInput,
    openWeekToClose(weeks.map((row) => ({
      weekStart: cairoYmdFromIso(row.weekStart.toISOString()),
      status: row.status,
    }))),
  );
  const { sunday, saturday } = range;
  const week = weeks.find((row) => cairoYmdFromIso(row.weekStart.toISOString()) === sunday) || null;

  const resolvedPostponeIds = new Set<number>();
  for (const item of weeks) {
    if (item.status !== "closed") continue;
    for (const line of item.lines) {
      if (line.resolvesLineId) resolvedPostponeIds.add(line.resolvesLineId);
    }
  }

  const settledIds = new Set<number>();
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
  const closedOther = weeks
    .filter((item) => item.status === "closed" && (!week || item.id !== week.id))
    .slice()
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  for (const item of closedOther) {
    for (const line of item.lines) {
      if (line.disposition === "collect" || line.disposition === "return") settledIds.add(line.confirmationId);
    }
  }
  for (const item of closedOther) {
    for (const line of item.lines) {
      if (line.disposition !== "postpone") continue;
      if (resolvedPostponeIds.has(line.id) || settledIds.has(line.confirmationId) || seenCarry.has(line.confirmationId)) continue;
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
  }
  const sourceWeekById = new Map(openPostpones.map((row) => [row.confirmationId, { fromYmd: row.fromYmd, toYmd: row.toYmd }]));
  const fallbackCarryFrom = closedOther[0] ? weekYmd(closedOther[0].weekStart) : LATE_FROM_YMD;
  const fallbackCarryTo = saturday;

  function carrySourceOf(confirmationId: number) {
    return sourceWeekById.get(confirmationId) || { fromYmd: fallbackCarryFrom, toYmd: fallbackCarryTo };
  }

  if (week?.status === "closed") {
    const ids = week.lines.map((line) => line.confirmationId);
    const snaps = ids.length
      ? await prisma.csOrderConfirmation.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            customerSnapshot: true,
            depositAmount: true,
            depositPaid: true,
            depositApprovalStatus: true,
            orderTotalDelta: true,
            discountApprovalStatus: true,
            courierOutcome: true,
            courierRefusalReason: true,
            ...SHEET_DAY_SELECT,
          },
        })
      : [];
    const snapById = new Map(snaps.map((row) => [row.id, row]));
    const overrides = await depositOverrides(ids);
    const days = await sheetDayById(sunday, saturday);
    const cutoffs = await listTemimaCutoffs();
    const edits = await listTemimaSheetEdits();
    const rows: TemimaSheetRow[] = week.lines.map((line) => {
      const order = snapById.get(line.confirmationId);
      const snap = (order?.customerSnapshot || {}) as { total?: string; paymentMethod?: string; paymentMethodId?: string | null };
      const disposition = storedDisposition(line.disposition);
      const resolvedCarry = Boolean(line.resolvesLineId);
      const override = overrides.get(line.confirmationId) ?? null;
      const naturalDay = resolvedCarry
        ? ""
        : days.get(line.confirmationId) || fallbackSheetDay(order, cutoffs, edits, sunday, saturday);
      const carried = resolvedCarry || (disposition === "postpone" && !naturalDay);
      const source = carried ? carrySourceOf(line.confirmationId) : null;
      return {
        confirmationId: line.confirmationId,
        wooOrderNumber: line.wooOrderNumber,
        customerName: customerNameOf(order?.customerSnapshot),
        productNames: productNamesOf(order?.customerSnapshot),
        ...contactOf(order?.customerSnapshot),
        cashAmount: Number(line.cashAmount),
        depositAmount: order ? settlementSplit(order, override, false).deposit : 0,
        orderTotal: order ? orderTotalOf(order, override, false) : money(snap.total),
        fawry: isFawryMethod(snap.paymentMethod, snap.paymentMethodId),
        disposition,
        isLarge: line.isLarge,
        carried,
        postponeLineId: line.resolvesLineId,
        sheetDay: carried ? "" : naturalDay,
        carryFromStart: source?.fromYmd,
        carryFromEnd: source?.toYmd,
        refusalReason: disposition === "return" ? refusalReasonOf(order || {}) : undefined,
      };
    }).filter((row) => {
      if (row.carried || !row.sheetDay) return range.fullWeek;
      return row.sheetDay >= range.start && row.sheetDay <= range.end;
    });
    const due = collectDueBreakdown(rows);
    return {
      ok: true as const,
      weekStart: range.start,
      weekEnd: range.end,
      fullWeek: range.fullWeek,
      status: "closed" as const,
      cashDue: Number(week.cashDue),
      weekCollectDue: due.weekCollectDue,
      priorPostponeCollectDue: due.priorPostponeCollectDue,
      priorPostponeCollectedOrders: due.priorPostponeCollectedOrders,
      cashPaid: Number(week.cashPaid),
      monthId: week.monthId,
      rows,
      refusals: refusalRowsOf(rows),
      history: historyOf(weeks),
    };
  }

  const days = await sheetDayById(range.start, range.end);
  const sheetIds = [...days.keys()];
  const carryIds = openPostpones.map((row) => row.confirmationId).filter((id) => !sheetIds.includes(id));
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

  const postponeIds = new Set(openPostpones.map((row) => row.confirmationId));
  const draft = new Map((week?.lines || []).map((line) => [line.confirmationId, line]));
  const overrides = await depositOverrides(orderIds);
  const cutoffs = await listTemimaCutoffs();
  const edits = await listTemimaSheetEdits();

  const rows: TemimaSheetRow[] = [];
  const sheetIdSet = new Set(sheetIds);
  for (const order of orders) {
    if (!sheetIdSet.has(order.id)) continue;
    if (settledIds.has(order.id) || postponeIds.has(order.id)) continue;
    const saved = draft.get(order.id);
    const snap = (order.customerSnapshot || {}) as { total?: string; paymentMethod?: string; paymentMethodId?: string | null };
    const override = overrides.get(order.id) ?? null;
    const split = settlementSplit(order, override, true, true);
    const disposition = storedDisposition(saved?.disposition);
    const sheetDay = days.get(order.id) || fallbackSheetDay(order, cutoffs, edits, range.start, range.end);
    const carried = !sheetDay;
    const source = carried ? carrySourceOf(order.id) : null;
    rows.push({
      confirmationId: order.id,
      wooOrderNumber: order.wooOrderNumber,
      customerName: customerNameOf(order.customerSnapshot),
      productNames: productNamesOf(order.customerSnapshot),
      ...contactOf(order.customerSnapshot),
      cashAmount: split.net,
      depositAmount: split.deposit,
      orderTotal: split.deposit + split.net,
      fawry: isFawryMethod(snap.paymentMethod, snap.paymentMethodId),
      disposition,
      isLarge: saved?.isLarge || false,
      carried,
      postponeLineId: null,
      sheetDay: carried ? "" : sheetDay,
      carryFromStart: source?.fromYmd,
      carryFromEnd: source?.toYmd,
      refusalReason: disposition === "return" ? refusalReasonOf(order) : undefined,
    });
  }

  for (const carried of openPostpones) {
    const saved = draft.get(carried.confirmationId);
    const order = orders.find((row) => row.id === carried.confirmationId);
    const snap = (order?.customerSnapshot || {}) as { total?: string; paymentMethod?: string; paymentMethodId?: string | null };
    const override = overrides.get(carried.confirmationId) ?? null;
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
      disposition: (saved?.disposition as TemimaDisposition) || "postpone",
      isLarge: saved?.isLarge ?? carried.isLarge,
      carried: true,
      postponeLineId: carried.lineId,
      sheetDay: "",
      carryFromStart: carried.fromYmd,
      carryFromEnd: carried.toYmd,
      refusalReason: storedDisposition(saved?.disposition) === "return" ? refusalReasonOf(order || {}) : undefined,
    });
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
  }>,
) {
  return weeks.slice(0, 12).map((row) => ({
    weekStart: cairoYmdFromIso(row.weekStart.toISOString()),
    weekEnd: cairoYmdFromIso(row.weekEnd.toISOString()),
    status: row.status,
    cashDue: Number(row.cashDue),
    cashPaid: Number(row.cashPaid),
    inMonth: Boolean(row.monthId),
  }));
}

async function upsertOpenWeek(sunday: string, endYmd: string, agentId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const start = cairoYmdBounds(sunday)?.start;
  const end = cairoYmdBounds(endYmd)?.start;
  if (!start || !end) return null;
  const existing = await prisma.csCarrierWeek.findUnique({
    where: { carrierCompany_weekStart: { carrierCompany: TEMIMA_COMPANY, weekStart: start } },
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
    },
  });
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
      week: { carrierCompany: TEMIMA_COMPANY, status: "open" },
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
  await ensureClosedTemimaWeeksFrom(LATE_FROM_YMD, input.agentId);

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
    }
  }

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
    const marked = snapshotRows.filter((row) => storedDisposition(row.disposition));
    if (marked.length) {
      await prisma.csCarrierWeekLine.createMany({ data: marked.map((row) => linePayload(week.id, row)) });
    }
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
  if (!input.allowClosed && (currentMark === "collect" || currentMark === "return")) {
    return { ok: false as const, message: "تم بنجاح والغاء متقفلين. التعديل للمؤجل فقط." };
  }

  const disposition: TemimaDisposition =
    input.result === "returned" ? "return" : input.result === "postponed" ? "postpone" : "collect";

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
  const openPostponeId = closedPostpones.find((line) => !resolvedIds.has(line.id))?.id ?? null;

  const cutoffs = await listTemimaCutoffs();
  const sheetDay = sayedSheetYmd(order, cutoffs) || cairoTodayYmd();
  const sheetSunday = sundayOnOrBefore(sheetDay);
  // Unresolved postpone from a closed week lands on the current open week only.
  const targetSunday = openPostponeId ? sundayOnOrBefore(cairoTodayYmd()) : sheetSunday;
  const targetSaturday = addDaysYmd(targetSunday, 6);
  const week = await upsertOpenWeek(targetSunday, targetSaturday, input.agentId);
  if (!week) return { ok: false as const, message: "تعذر فتح الأسبوع." };
  const weekClosed = week.status === "closed";
  if (weekClosed && !input.allowClosed) return { ok: false as const, message: "الأسبوع مقفل." };

  const overrides = await depositOverrides([order.id]);
  const split = settlementSplit(order, overrides.get(order.id) ?? null, true, true);
  const existing = await prisma.csCarrierWeekLine.findFirst({
    where: { weekId: week.id, confirmationId: order.id },
    select: { isLarge: true },
  });

  await prisma.csCarrierWeekLine.deleteMany({ where: { weekId: week.id, confirmationId: order.id } });
  await prisma.csCarrierWeekLine.create({
    data: {
      weekId: week.id,
      confirmationId: order.id,
      wooOrderNumber: order.wooOrderNumber,
      disposition,
      cashAmount: split.net,
      isLarge: disposition === "collect" ? Boolean(existing?.isLarge) : false,
      resolvesLineId: disposition !== "postpone" ? openPostponeId : null,
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
