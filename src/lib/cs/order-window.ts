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

export function isPaidOnlineHighlight(paymentMethod: string, paymentMethodId?: string | null) {
  const s = `${paymentMethod || ""} ${paymentMethodId || ""}`.toLowerCase();
  if (!s.trim()) return false;
  if (/cod|cash on delivery|دفع عند الاستلام|عند الاستلام/.test(s)) return false;
  return /fawry|فورى|فوري|wallet|محفظ|vodafone|etisalat|orange|instapay|paymob|card|visa|mastercard|credit/.test(
    s,
  );
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
