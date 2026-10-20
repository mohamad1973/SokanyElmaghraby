/** CS queue: Egypt calendar window (today + yesterday). Africa/Cairo = UTC+2. */

const CAIRO_OFFSET = "+02:00";

function cairoYmdParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "00";

  return { y: get("year"), m: get("month"), d: get("day") };
}

function cairoDayStartMs(y: string, m: string, d: string) {
  return Date.parse(`${y}-${m}-${d}T00:00:00${CAIRO_OFFSET}`);
}

export function getCairoYesterdayStartDateString() {
  const { y, m, d } = cairoYmdParts();
  const yesterdayMs = cairoDayStartMs(y, m, d) - 24 * 60 * 60 * 1000;
  const parts = cairoYmdParts(new Date(yesterdayMs));
  return `${parts.y}-${parts.m}-${parts.d}`;
}

export function cairoTodayYmd() {
  const { y, m, d } = cairoYmdParts();
  return `${y}-${m}-${d}`;
}

export function cairoYesterdayYmd() {
  return getCairoYesterdayStartDateString();
}

/** Cairo YMD for N calendar days before today (0 = today). */
export function cairoDaysAgoYmd(daysBack: number) {
  const { y, m, d } = cairoYmdParts();
  const start = cairoDayStartMs(y, m, d) - Math.max(0, daysBack) * 24 * 60 * 60 * 1000;
  const parts = cairoYmdParts(new Date(start));
  return `${parts.y}-${parts.m}-${parts.d}`;
}

export function isWithinCairoTodayOrYesterday(iso: string | null | undefined) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;

  const { y, m, d } = cairoYmdParts();
  const todayStart = cairoDayStartMs(y, m, d);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  return t >= yesterdayStart && t < tomorrowStart;
}

/** Inclusive calendar range in Africa/Cairo (fromYmd / toYmd as YYYY-MM-DD). */
export function isWithinCairoDateRange(
  iso: string | null | undefined,
  fromYmd: string,
  toYmd: string,
) {
  if (!iso || !fromYmd || !toYmd) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const start = cairoDayStartMs(...(fromYmd.split("-") as [string, string, string]));
  const endExclusive =
    cairoDayStartMs(...(toYmd.split("-") as [string, string, string])) + 24 * 60 * 60 * 1000;
  if (Number.isNaN(start) || Number.isNaN(endExclusive)) return false;
  return t >= start && t < endExclusive;
}

/** UTC Date bounds for a Cairo calendar YMD (start inclusive, end exclusive). */
export function cairoYmdBounds(ymd: string): { start: Date; endExclusive: Date } | null {
  const parts = ymd.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  const startMs = cairoDayStartMs(y, m, d);
  if (Number.isNaN(startMs)) return null;
  return {
    start: new Date(startMs),
    endExclusive: new Date(startMs + 24 * 60 * 60 * 1000),
  };
}

/** Inclusive list of Cairo YMD strings from fromYmd to toYmd. */
export function eachCairoYmdInclusive(fromYmd: string, toYmd: string): string[] {
  const from = cairoYmdBounds(fromYmd);
  const to = cairoYmdBounds(toYmd);
  if (!from || !to || from.start.getTime() > to.start.getTime()) return [];
  const days: string[] = [];
  for (let t = from.start.getTime(); t <= to.start.getTime(); t += 24 * 60 * 60 * 1000) {
    const p = cairoYmdParts(new Date(t));
    days.push(`${p.y}-${p.m}-${p.d}`);
  }
  return days;
}

/** Cairo clock using the same fixed +02:00 offset as day bounds and SQL. */
export function cairoOffsetClock(value: string | Date | null | undefined): { ymd: string; minutes: number } | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  const shifted = new Date(time + 2 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return { ymd: `${y}-${m}-${d}`, minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

export function addCairoYmdDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map((part) => Number(part));
  if (!y || !m || !d) return "";
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

/** Cairo calendar day and minutes since midnight for an ISO timestamp. */
export function cairoClock(iso: string | null | undefined): { ymd: string; minutes: number } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  let hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (!ymd || ymd.includes("undefined") || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour === 24) hour = 0;
  return { ymd, minutes: hour * 60 + minute };
}

/** Cairo YMD for an ISO timestamp. */
export function cairoYmdFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { y, m, d } = cairoYmdParts(date);
  return `${y}-${m}-${d}`;
}

/** Keep recent rows in memory for CS filters (last N Cairo calendar days). */
export function isWithinCairoLastDays(iso: string | null | undefined, daysBack = 30) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const { y, m, d } = cairoYmdParts();
  const todayStart = cairoDayStartMs(y, m, d);
  const fromStart = todayStart - Math.max(0, daysBack - 1) * 24 * 60 * 60 * 1000;
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  return t >= fromStart && t < tomorrowStart;
}

export function formatCairoOrderDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isFawryMethod(paymentMethod?: string | null, paymentMethodId?: string | null) {
  return /fawry|فورى|فوري/.test(`${paymentMethod || ""} ${paymentMethodId || ""}`.toLowerCase());
}

export function isPaidOnlineHighlight(paymentMethod: string, paymentMethodId?: string | null) {
  const s = `${paymentMethod || ""} ${paymentMethodId || ""}`.toLowerCase();
  if (!s.trim()) return false;
  if (/cod|cash on delivery|دفع عند الاستلام|عند الاستلام/.test(s)) return false;
  return /fawry|فورى|فوري|wallet|محفظ|vodafone|etisalat|orange|instapay|paymob|card|visa|mastercard|credit/.test(
    s,
  );
}

export type CsPaymentState = "awaiting_payment" | "paid" | "cod";

export function parseMoneyAmount(value: unknown): number {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function hasWaybillTotal(snap: { waybillTotal?: unknown } | null | undefined): boolean {
  if (!snap) return false;
  if (snap.waybillTotal == null) return false;
  return String(snap.waybillTotal).trim() !== "";
}

type FulfillmentMoneySnap = {
  fulfillmentKind?: unknown;
  settlementDirection?: unknown;
  settlementAbs?: unknown;
  waybillTotal?: unknown;
  wooTotal?: unknown;
  total?: unknown;
};

/**
 * Signed account amount for a return/exchange child.
 * A return is money the courier pays the customer, so it always decreases the account.
 * An exchange keeps the entered sign: positive collect, negative refund.
 * Returns null for ordinary orders.
 */
export function fulfillmentAccountAmount(
  snap: FulfillmentMoneySnap | null | undefined,
  rowKind?: string | null,
): number | null {
  const kind = String(rowKind || snap?.fulfillmentKind || "").trim();
  if (kind !== "return" && kind !== "exchange") return null;
  const direction = String(snap?.settlementDirection || "").trim();
  const absField = Number(snap?.settlementAbs);
  const raw = String(snap?.waybillTotal ?? snap?.total ?? snap?.wooTotal ?? "").trim();
  const parsed = Number(raw.replace(/[^\d.]/g, ""));
  const abs =
    Number.isFinite(absField) && absField > 0 ? absField : Number.isFinite(parsed) ? parsed : 0;
  if (kind === "return") return abs === 0 ? 0 : -abs;
  if (direction === "refund" || raw.startsWith("-")) return abs === 0 ? 0 : -abs;
  if (direction === "none") return 0;
  return abs;
}

/** Prefer waybillTotal (post-discount COD base) when set; else wooTotal/total. */
export function baseTotalFromSnapshot(
  snap: FulfillmentMoneySnap | null | undefined,
): number {
  if (!snap) return 0;
  const signed = fulfillmentAccountAmount(snap);
  if (signed != null) return signed;
  if (hasWaybillTotal(snap)) return parseMoneyAmount(snap.waybillTotal);
  return parseMoneyAmount(snap.wooTotal ?? snap.total);
}

/**
 * Build sheetCollectedSplit inputs from a confirmation snapshot + money columns.
 * When waybillTotal is present it already includes an approved discount — do not re-apply delta.
 */
export function sheetSplitFromConfirmation(input: {
  customerSnapshot: unknown;
  depositAmount?: unknown;
  depositPaid?: boolean | null;
  depositApprovalStatus?: string | null;
  orderTotalDelta?: unknown;
  discountApprovalStatus?: string | null;
  settlementDepositOverride?: number | null;
  keepCancelledValue?: boolean;
  /** Recompute Fawry/online state from Woo fields instead of trusting snap.paymentState. */
  freshPaymentState?: boolean;
}) {
  const snap = (input.customerSnapshot || {}) as {
    waybillTotal?: unknown;
    wooTotal?: unknown;
    total?: unknown;
    paymentMethod?: string;
    paymentMethodId?: string | null;
    wooStatus?: string;
    datePaid?: string | null;
    paymentState?: CsPaymentState;
  };
  const paymentState = input.freshPaymentState
    ? effectivePaymentState({
        paymentMethod: snap.paymentMethod,
        paymentMethodId: snap.paymentMethodId,
        wooStatus: snap.wooStatus,
        datePaid: snap.datePaid,
        paymentState: snap.paymentState,
      })
    : snap.paymentState ||
      resolvePaymentState({
        paymentMethod: snap.paymentMethod,
        paymentMethodId: snap.paymentMethodId,
        wooStatus: snap.wooStatus,
        datePaid: snap.datePaid,
      });

  const waybillSet = hasWaybillTotal(snap);
  const deltaRaw = Number(input.orderTotalDelta);
  const delta =
    !waybillSet && Number.isFinite(deltaRaw) ? deltaRaw : null;

  return {
    total: baseTotalFromSnapshot(snap),
    wooStatus: snap.wooStatus,
    paymentState,
    depositAmount: parseMoneyAmount(input.depositAmount),
    depositPaid: input.depositPaid ?? null,
    depositApprovalStatus: input.depositApprovalStatus,
    orderTotalDelta: delta,
    discountApprovalStatus: waybillSet ? null : input.discountApprovalStatus,
    settlementDepositOverride: input.settlementDepositOverride,
    keepCancelledValue: input.keepCancelledValue,
  };
}

/** Deposit is money already collected. Net is what shipping still collects. */
export function sheetCollectedSplit(input: {
  total: number;
  wooStatus?: string | null;
  paymentState: CsPaymentState;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
  depositApprovalStatus?: string | null;
  orderTotalDelta?: number | null;
  discountApprovalStatus?: string | null;
  settlementDepositOverride?: number | null;
  /** Open Temima settlement keeps a cancelled sheet order at its value. */
  keepCancelledValue?: boolean;
}) {
  const signedBase = Number(input.total) || 0;
  // Courier pays the customer: the sheet and settlement must subtract, not add.
  if (signedBase < 0) return { deposit: 0, net: Math.round(signedBase * 100) / 100 };
  const base = Math.max(0, signedBase);
  const delta = Number(input.orderTotalDelta);
  const discountOk =
    String(input.discountApprovalStatus || "").toLowerCase() === "approved" &&
    Number.isFinite(delta) &&
    delta < 0;
  const total = Math.max(0, base + (discountOk ? delta : 0));
  const status = String(input.wooStatus || "").toLowerCase().trim();
  const cancelled = status === "cancelled" || status === "canceled" || status === "failed" || status === "refunded" || status === "trash";
  const override = input.settlementDepositOverride;
  if (override != null && Number.isFinite(Number(override))) {
    const deposit = Math.min(total, Math.max(0, Number(override)));
    return { deposit, net: Math.max(0, total - deposit) };
  }
  if (!input.keepCancelledValue && cancelled && input.paymentState !== "paid") return { deposit: 0, net: 0 };
  if (input.paymentState === "paid") return { deposit: total, net: 0 };
  const approved =
    Boolean(input.depositPaid || String(input.depositApprovalStatus || "").toLowerCase() === "approved") &&
    Number(input.depositAmount) > 0;
  const deposit = approved ? Math.min(total, Number(input.depositAmount) || 0) : 0;
  return { deposit, net: Math.max(0, total - deposit) };
}

/**
 * Real payment completion for CS badges/filters — not just payment method.
 * Online + Woo pending (no date_paid) = awaiting; online + paid/processing = paid; COD = cod.
 * Fawry counts as paid only when Woo recorded a payment date or the order is completed.
 */
export function resolvePaymentState(input: {
  paymentMethod?: string | null;
  paymentMethodId?: string | null;
  wooStatus?: string | null;
  datePaid?: string | null;
}): CsPaymentState {
  const method = String(input.paymentMethod || "");
  const methodId = String(input.paymentMethodId || "");
  const online = isPaidOnlineHighlight(method, methodId);
  if (!online) return "cod";

  const status = String(input.wooStatus || "").toLowerCase().trim();
  const datePaid = String(input.datePaid || "").trim();
  if (datePaid && datePaid !== "null") return "paid";
  if (isFawryMethod(method, methodId)) {
    return status === "completed" ? "paid" : "awaiting_payment";
  }
  if (status === "pending" || status === "failed" || status === "cancelled") {
    return "awaiting_payment";
  }
  if (status === "processing" || status === "on-hold" || status === "completed") {
    return "paid";
  }
  // Unknown online status without date_paid → treat as awaiting to avoid false "مدفوع"
  return "awaiting_payment";
}

export function effectivePaymentState(input: {
  paymentMethod?: string | null;
  paymentMethodId?: string | null;
  wooStatus?: string | null;
  datePaid?: string | null;
  paymentState?: CsPaymentState | null;
}): CsPaymentState {
  if (isFawryMethod(input.paymentMethod, input.paymentMethodId)) return resolvePaymentState(input);
  if (input.paymentState === "paid" || input.paymentState === "awaiting_payment" || input.paymentState === "cod") {
    return input.paymentState;
  }
  return resolvePaymentState(input);
}

export function formatCairoOrderDateTime(iso: string | null | undefined) {
  if (!iso) return { absolute: "—", relative: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { absolute: "—", relative: "" };

  const absolute = new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  const diffMs = Date.now() - date.getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  let relative = "الآن";
  if (mins >= 24 * 60) {
    const days = Math.floor(mins / (24 * 60));
    relative = days === 1 ? "منذ يوم" : `منذ ${days} أيام`;
  } else if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    relative = hours === 1 ? "منذ ساعة" : `منذ ${hours} ساعات`;
  } else if (mins >= 1) {
    relative = mins === 1 ? "منذ دقيقة" : `منذ ${mins} دقيقة`;
  }

  return { absolute, relative };
}

/** Deposit payment time as day/month hour:minute صباحاً or مساءً in Cairo. */
export function formatDepositPaidClock(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const hour24 = Number(pick("hour"));
  if (!Number.isFinite(hour24)) return "—";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 < 12 ? "صباحاً" : "مساءً";
  return `${pick("day")}/${pick("month")} ${hour12}:${pick("minute")} ${period}`;
}
