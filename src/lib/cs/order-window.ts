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

export function isPaidOnlineHighlight(paymentMethod: string, paymentMethodId?: string | null) {
  const s = `${paymentMethod || ""} ${paymentMethodId || ""}`.toLowerCase();
  if (!s.trim()) return false;
  if (/cod|cash on delivery|دفع عند الاستلام|عند الاستلام/.test(s)) return false;
  return /fawry|فورى|فوري|wallet|محفظ|vodafone|etisalat|orange|instapay|paymob|card|visa|mastercard|credit/.test(
    s,
  );
}

export type CsPaymentState = "awaiting_payment" | "paid" | "cod";

/**
 * Real payment completion for CS badges/filters — not just payment method.
 * Online + Woo pending (no date_paid) = awaiting; online + paid/processing = paid; COD = cod.
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
  if (status === "pending" || status === "failed" || status === "cancelled") {
    return "awaiting_payment";
  }
  if (status === "processing" || status === "on-hold" || status === "completed") {
    return "paid";
  }
  // Unknown online status without date_paid → treat as awaiting to avoid false "مدفوع"
  return "awaiting_payment";
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
