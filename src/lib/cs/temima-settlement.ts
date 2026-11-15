import "server-only";

import { ensureCsTables } from "@/lib/cs/agents";
import {
  baseTotalFromSnapshot,
  cairoTodayYmd,
  cairoYmdBounds,
  cairoYmdFromIso,
  isFawryMethod,
  isPaidOnlineHighlight,
  sheetCollectedSplit,
  sheetSplitFromConfirmation,
} from "@/lib/cs/order-window";
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

/** Goods value frozen on first sheet sight — never overwritten once > 0. */
function lineFrozenOrderTotal(line: { orderTotal?: unknown } | null | undefined) {
  const n = Number(line?.orderTotal);
  return Number.isFinite(n) && n > 0 ? n : 0;
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
  const snap = (row.customerSnapshot || {}) as {
    paymentMethod?: string;
    paymentMethodId?: string | null;
    wooStatus?: string | null;
    status?: string | null;
    total?: unknown;
    wooTotal?: unknown;
    waybillTotal?: unknown;
  };
  const fawry = isFawryMethod(snap.paymentMethod, snap.paymentMethodId);
  const online = isPaidOnlineHighlight(String(snap.paymentMethod || ""), snap.paymentMethodId);
  // Agents often approve a full-order discount so the COD waybill prints at 0.
  // That must not wipe Temima goods value for Fawry.
  let orderTotalDelta = row.orderTotalDelta;
  let discountApprovalStatus = row.discountApprovalStatus;
  if (fawry) {
    const base = baseTotalFromSnapshot(snap);
    const delta = Number(orderTotalDelta);
    const discountOk =
      String(discountApprovalStatus || "").toLowerCase() === "approved" &&
      Number.isFinite(delta) &&
      delta < 0;
    if (discountOk && base + delta <= 0) {
      orderTotalDelta = null;
      discountApprovalStatus = null;
    }
  }

  const split = sheetCollectedSplit(
    sheetSplitFromConfirmation({
      ...row,
      orderTotalDelta,
      discountApprovalStatus,
      settlementDepositOverride: override,
      keepCancelledValue,
      freshPaymentState: freshFawry,
    }),
  );

  const wooStatus = String(snap.wooStatus || snap.status || "")
    .toLowerCase()
    .trim();
  const cancelled =
    wooStatus === "cancelled" ||
    wooStatus === "canceled" ||
    wooStatus === "failed" ||
    wooStatus === "refunded" ||
    wooStatus === "trash";
  const goodsTotal = Math.round((split.deposit + split.net) * 100) / 100;

  // Cancelled (etc.): never count as website deposit; keep goods value on net.
  if (cancelled) {
    return { deposit: 0, net: goodsTotal };
  }

  // Website prepaid deposit only when Woo status is completed.
  if (
    (fawry || online) &&
    wooStatus === "completed" &&
    (override == null || !Number.isFinite(Number(override)))
  ) {
    if (goodsTotal > 0) return { deposit: goodsTotal, net: 0 };
  }

  return split;
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

async function ensureCarrierWeekLineFreezeColumns() {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  const alters = [
    "ALTER TABLE `CsCarrierWeekLine` ADD COLUMN `orderTotal` DECIMAL(12,2) NOT NULL DEFAULT 0",
    "ALTER TABLE `CsCarrierWeekLine` ADD COLUMN `depositAmount` DECIMAL(12,2) NOT NULL DEFAULT 0",
    "ALTER TABLE `CsCarrierWeekLine` ADD COLUMN `sheetDay` VARCHAR(10) NULL",
  ];
  for (const sql of alters) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Duplicate column|already exists|1060/i.test(message)) {
        console.warn("[temima-settlement] freeze column ALTER:", message.slice(0, 240));
      }
    }
  }
  const cols = await prisma.$queryRawUnsafe<Array<{ colName: string }>>(
    `SELECT COLUMN_NAME AS colName FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'CsCarrierWeekLine'
       AND COLUMN_NAME IN ('orderTotal', 'depositAmount', 'sheetDay')`,
  );
  const have = new Set(cols.map((row) => String(row.colName)));
  if (!have.has("orderTotal") || !have.has("depositAmount") || !have.has("sheetDay")) {
    return {
      ok: false as const,
      message: "تعذر تجهيز أعمدة تثبيت قيمة الشحنات على قاعدة البيانات. تأكد من صلاحية ALTER.",
    };
  }
  return { ok: true as const };
}

export async function getTemimaWeekSheet(weekStartInput?: string, weekEndInput?: string, agentId = 0) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  try {
    await ensureCsTables();
    const freezeCols = await ensureCarrierWeekLineFreezeColumns();
    if (!freezeCols.ok) return freezeCols;

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

  if (week?.status === "closed") {
    return loadClosedTemimaWeekSheet(week, weeks, range);
  }

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
    const rawDisposition = storedDisposition(saved?.disposition);
    // UI: postpone = لم يسجل (no separate مؤجل column/option).
    const disposition: TemimaDisposition | "" = rawDisposition === "postpone" ? "" : rawDisposition;
    const sheetDay =
      days.get(id) ||
      (order ? fallbackSheetDay(order, cutoffs, edits, range.start, range.end) : "") ||
      range.start;
    const liveTotal = order ? split.deposit + split.net : Number(saved?.cashAmount || 0);
    const frozenTotal = lineFrozenOrderTotal(saved);
    const orderTotal = frozenTotal || liveTotal;
    const depositAmount = order ? split.deposit : 0;
    const cashAmount = frozenTotal > 0 ? orderTotal - depositAmount : split.net;
    rows.push({
      confirmationId: id,
      wooOrderNumber: order?.wooOrderNumber || saved?.wooOrderNumber || "",
      customerName: order ? customerNameOf(order.customerSnapshot) : "—",
      productNames: order ? productNamesOf(order.customerSnapshot) : "—",
      ...(order ? contactOf(order.customerSnapshot) : { phone: "", address: "" }),
      cashAmount,
      depositAmount,
      orderTotal,
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
      const rawDisposition = storedDisposition(saved?.disposition) || "postpone";
      const disposition: TemimaDisposition | "" = rawDisposition === "postpone" ? "" : rawDisposition;
      const liveTotal = order ? orderTotalOf(order, override, true) : money(snap.total);
      const frozenTotal = lineFrozenOrderTotal(saved);
      const orderTotal = frozenTotal || liveTotal;
      const depositAmount = order ? settlementSplit(order, override, true).deposit : 0;
      rows.push({
        confirmationId: carried.confirmationId,
        wooOrderNumber: carried.wooOrderNumber,
        customerName: order ? customerNameOf(order.customerSnapshot) : "—",
        productNames: order ? productNamesOf(order.customerSnapshot) : "—",
        ...(order ? contactOf(order.customerSnapshot) : { phone: "", address: "" }),
        cashAmount: carried.cashAmount,
        depositAmount,
        orderTotal,
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

  if (sheetIds.length) {
    const openWeek =
      week && week.status !== "closed" ? week : await upsertOpenWeek(range.sunday, range.end, agentId);
    if (openWeek && openWeek.status !== "closed") {
      try {
        await ensureOpenWeekShipmentFreeze(openWeek.id, rows);
      } catch (error) {
        console.warn(
          "[temima-settlement] shipment freeze skipped",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  rows.sort((a, b) => Number(b.wooOrderNumber) - Number(a.wooOrderNumber));
  const due = collectDueBreakdown(rows);

  return {
    ok: true as const,
    weekStart: range.start,
    weekEnd: range.end,
    fullWeek: range.fullWeek,
    status: (week?.status === "closed" ? "closed" : "open") as "open" | "closed",
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

type WeekWithLines = Awaited<ReturnType<typeof loadWeeks>>[number];

async function loadClosedTemimaWeekSheet(
  week: WeekWithLines,
  weeks: WeekWithLines[],
  range: { start: string; end: string; fullWeek: boolean },
) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };

  const lines = week.lines.filter((line) => !line.resolvesLineId);
  const orderIds = [...new Set(lines.map((line) => line.confirmationId))];
  const orders = orderIds.length
    ? await prisma.csOrderConfirmation.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          wooOrderNumber: true,
          customerSnapshot: true,
          courierOutcome: true,
          courierRefusalReason: true,
        },
      })
    : [];
  const orderById = new Map(orders.map((row) => [row.id, row]));

  const rows: TemimaSheetRow[] = lines.map((line) => {
    const order = orderById.get(line.confirmationId);
    const snap = (order?.customerSnapshot || {}) as {
      total?: string;
      paymentMethod?: string;
      paymentMethodId?: string | null;
    };
    const typed = line as typeof line & {
      orderTotal?: unknown;
      depositAmount?: unknown;
      sheetDay?: string | null;
    };
    const frozenTotal = Number(typed.orderTotal);
    const frozenDeposit = Number(typed.depositAmount);
    const cashAmount = Number(line.cashAmount) || 0;
    const depositAmount = Number.isFinite(frozenDeposit) ? Math.max(0, frozenDeposit) : 0;
    const orderTotal =
      Number.isFinite(frozenTotal) && frozenTotal > 0
        ? frozenTotal
        : depositAmount + cashAmount || money(snap.total);
    const rawDisposition = storedDisposition(line.disposition);
    const disposition: TemimaDisposition | "" = rawDisposition === "postpone" ? "" : rawDisposition;
    return {
      confirmationId: line.confirmationId,
      wooOrderNumber: order?.wooOrderNumber || line.wooOrderNumber || "",
      customerName: order ? customerNameOf(order.customerSnapshot) : "—",
      productNames: order ? productNamesOf(order.customerSnapshot) : "—",
      ...(order ? contactOf(order.customerSnapshot) : { phone: "", address: "" }),
      cashAmount,
      depositAmount,
      orderTotal,
      fawry: isFawryMethod(snap.paymentMethod, snap.paymentMethodId),
      disposition,
      isLarge: Boolean(line.isLarge),
      carried: false,
      carryLocked: false,
      postponeLineId: null,
      sheetDay: String(typed.sheetDay || range.start),
      refusalReason: disposition === "return" ? refusalReasonOf(order || {}) : undefined,
    };
  });

  rows.sort((a, b) => Number(b.wooOrderNumber) - Number(a.wooOrderNumber));
  const due = collectDueBreakdown(rows);

  return {
    ok: true as const,
    weekStart: range.start,
    weekEnd: range.end,
    fullWeek: range.fullWeek,
    status: "closed" as const,
    cashDue: Number(week.cashDue) || due.cashDue,
    weekCollectDue: due.weekCollectDue,
    priorPostponeCollectDue: due.priorPostponeCollectDue,
    priorPostponeCollectedOrders: due.priorPostponeCollectedOrders,
    cashPaid: Number(week.cashPaid) || 0,
    monthId: week.monthId ?? null,
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

async function ensureOpenWeekShipmentFreeze(weekId: number, rows: TemimaSheetRow[]) {
  const prisma = getPrismaClient();
  if (!prisma || !rows.length) return;
  const targets = rows.filter((row) => !row.carried && Number(row.orderTotal) > 0);
  if (!targets.length) return;
  const existing = await prisma.csCarrierWeekLine.findMany({
    where: {
      weekId,
      confirmationId: { in: targets.map((row) => row.confirmationId) },
      resolvesLineId: null,
    },
  });
  const byConf = new Map(existing.map((line) => [line.confirmationId, line]));
  const toCreate: ReturnType<typeof listedFreezePayload>[] = [];
  for (const row of targets) {
    const line = byConf.get(row.confirmationId);
    const frozen = lineFrozenOrderTotal(line);
    if (line) {
      if (frozen > 0) continue;
      await prisma.csCarrierWeekLine.update({
        where: { id: line.id },
        data: {
          orderTotal: Number(row.orderTotal) || 0,
          sheetDay: row.sheetDay || line.sheetDay || null,
        },
      });
      continue;
    }
    toCreate.push(listedFreezePayload(weekId, row));
  }
  if (toCreate.length) {
    await prisma.csCarrierWeekLine.createMany({ data: toCreate });
  }
}

function listedFreezePayload(weekId: number, row: TemimaSheetRow) {
  return {
    weekId,
    confirmationId: row.confirmationId,
    wooOrderNumber: row.wooOrderNumber,
    disposition: "listed",
    cashAmount: row.cashAmount,
    orderTotal: Number(row.orderTotal) || 0,
    depositAmount: Number(row.depositAmount) || 0,
    sheetDay: row.sheetDay || null,
    isLarge: false,
    resolvesLineId: null as number | null,
  };
}

function linePayload(
  weekId: number,
  row: TemimaSheetRow,
  existing?: { orderTotal?: unknown; depositAmount?: unknown; sheetDay?: string | null } | null,
) {
  const disposition = storedDisposition(row.disposition);
  const prevTotal = lineFrozenOrderTotal(existing);
  return {
    weekId,
    confirmationId: row.confirmationId,
    wooOrderNumber: row.wooOrderNumber,
    disposition,
    cashAmount: row.cashAmount,
    orderTotal: prevTotal > 0 ? prevTotal : Number(row.orderTotal) || 0,
    depositAmount: Number(row.depositAmount) || 0,
    sheetDay: row.sheetDay || existing?.sheetDay || null,
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
    const prior = await prisma.csCarrierWeekLine.findMany({
      where: { weekId: week.id, confirmationId: { in: edited.map((row) => row.confirmationId) } },
    });
    const priorByConf = new Map(prior.map((line) => [line.confirmationId, line]));
    await prisma.csCarrierWeekLine.deleteMany({
      where: { weekId: week.id, confirmationId: { in: edited.map((row) => row.confirmationId) } },
    });
    const marked = edited.filter((row) => storedDisposition(row.disposition));
    const keepFreeze = edited.filter((row) => !storedDisposition(row.disposition) && Number(row.orderTotal) > 0);
    const payloads = [
      ...marked.map((row) => linePayload(week.id, row, priorByConf.get(row.confirmationId))),
      ...keepFreeze.map((row) => listedFreezePayload(week.id, {
        ...row,
        orderTotal: lineFrozenOrderTotal(priorByConf.get(row.confirmationId)) || Number(row.orderTotal) || 0,
      })),
    ];
    if (payloads.length) {
      await prisma.csCarrierWeekLine.createMany({ data: payloads });
    }
    for (const row of marked) {
      const disposition = storedDisposition(row.disposition);
      if (!disposition) continue;
      await prisma.$executeRaw`
        UPDATE CsOrderConfirmation SET temimaSupervisorResult = ${disposition} WHERE id = ${row.confirmationId}
      `;
    }
  }

  await lockResolvedCarryLines(input.agentId);

  if (input.close) {
    const priorFreeze = await prisma.csCarrierWeekLine.findMany({ where: { weekId: week.id } });
    const priorByConf = new Map(priorFreeze.map((line) => [line.confirmationId, line]));
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
      await prisma.csCarrierWeekLine.createMany({
        data: marked.map((row) => linePayload(week.id, row, priorByConf.get(row.confirmationId))),
      });
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
    where: { carrierCompany: TEMIMA_COMPANY, status: "closed", carryKey: 0, weekStart: { in: starts } },
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
  // Empty (لم يسجل) and postpone both convert to success/cancel on the original sheet week,
  // including when that settlement week is already closed.
  const convertingPostpone =
    (!currentMark || currentMark === "postpone") && (disposition === "collect" || disposition === "return");
  const switchingFinal =
    (currentMark === "collect" || currentMark === "return") &&
    (disposition === "collect" || disposition === "return");

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
  // Sayed/admin may switch تم بنجاح↔الغاء even on a closed settlement week.
  if (weekClosed && !input.allowClosed && !convertingPostpone && !switchingFinal) {
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

/** Clear تم بنجاح/الغاء so the order looks unmarked until a new choice is saved. */
export async function clearSupervisorOrderResult(confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  if (!Number.isInteger(confirmationId) || confirmationId <= 0) {
    return { ok: false as const, message: "الأوردر غير موجود." };
  }
  await ensureCsTables();
  const order = await prisma.csOrderConfirmation.findFirst({
    where: { id: confirmationId, status: "CONFIRMED", shippingCompany: TEMIMA_COMPANY },
    select: { id: true },
  });
  if (!order) return { ok: false as const, message: "الأوردر مش على شيت سيد تميمة." };

  const lines = await prisma.csCarrierWeekLine.findMany({
    where: {
      confirmationId,
      week: { carrierCompany: TEMIMA_COMPANY, carryKey: 0 },
    },
    select: { id: true, weekId: true },
  });
  const weekIds = [...new Set(lines.map((line) => line.weekId))];
  if (lines.length) {
    await prisma.csCarrierWeekLine.deleteMany({ where: { id: { in: lines.map((line) => line.id) } } });
  }
  for (const weekId of weekIds) {
    await refreshWeekCashDue(weekId);
  }
  await prisma.$executeRaw`
    UPDATE CsOrderConfirmation
    SET temimaSupervisorResult = NULL
    WHERE id = ${confirmationId}
  `;
  return { ok: true as const, disposition: "" as const };
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
