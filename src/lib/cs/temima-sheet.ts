import { cairoClock, isWithinCairoDateRange } from "@/lib/cs/order-window";

export type TemimaCutoff = { dayYmd: string; minutes: number };

export function cutoffMinutes(hour: number, minute: number) {
  return hour * 60 + minute;
}

export function isValidTemimaCutoff(hour: number, minute: number) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false;
  if (minute < 0 || minute > 59) return false;
  const total = cutoffMinutes(hour, minute);
  return total >= 8 * 60 && total <= 16 * 60;
}

export function formatCutoffMinutes(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function clockOf(value: string | Date | null | undefined) {
  const iso = value instanceof Date ? value.toISOString() : value;
  return cairoClock(iso);
}

function cutoffFor(iso: string | Date | null | undefined, cutoffs: TemimaCutoff[]) {
  const clock = clockOf(iso);
  if (!clock) return null;
  return { clock, cutoff: cutoffs.find((row) => row.dayYmd === clock.ymd) || null };
}

/** No cutoff that day means the sheet stays open. A cutoff keeps times strictly before it. */
export function isBeforeTemimaCutoff(iso: string | Date | null | undefined, cutoffs: TemimaCutoff[]) {
  const found = cutoffFor(iso, cutoffs);
  if (!found) return false;
  if (!found.cutoff) return true;
  return found.clock.minutes < found.cutoff.minutes;
}

export function isLateTemimaConfirm(confirmedAt: string | Date | null | undefined, cutoffs: TemimaCutoff[]) {
  const found = cutoffFor(confirmedAt, cutoffs);
  if (!found?.cutoff) return false;
  return found.clock.minutes >= found.cutoff.minutes;
}

export function onSayedTemimaSheet(
  confirmedAt: string | Date | null | undefined,
  handedToCarrierAt: string | Date | null | undefined,
  dateFrom: string,
  dateTo: string,
  cutoffs: TemimaCutoff[],
) {
  const saved =
    Boolean(confirmedAt) &&
    isWithinCairoDateRange(confirmedAt instanceof Date ? confirmedAt.toISOString() : confirmedAt, dateFrom, dateTo) &&
    isBeforeTemimaCutoff(confirmedAt, cutoffs);
  const handed =
    Boolean(handedToCarrierAt) &&
    isWithinCairoDateRange(
      handedToCarrierAt instanceof Date ? handedToCarrierAt.toISOString() : handedToCarrierAt,
      dateFrom,
      dateTo,
    ) &&
    isBeforeTemimaCutoff(handedToCarrierAt, cutoffs);
  return saved || handed;
}

export function onSecondTemimaSheet(
  confirmedAt: string | Date | null | undefined,
  dateFrom: string,
  dateTo: string,
  cutoffs: TemimaCutoff[],
) {
  if (!confirmedAt) return false;
  const iso = confirmedAt instanceof Date ? confirmedAt.toISOString() : confirmedAt;
  if (!isWithinCairoDateRange(iso, dateFrom, dateTo)) return false;
  return isLateTemimaConfirm(confirmedAt, cutoffs);
}

/** First handoff keeps its time. A later-day mark moves only a post-cutoff order. */
export function resolveHandedToCarrierAt(
  previous: string | Date | null | undefined,
  confirmedAt: string | Date | null | undefined,
  now: Date,
  cutoffs: TemimaCutoff[],
) {
  const prevIso = previous instanceof Date ? previous.toISOString() : previous || "";
  if (!prevIso) return now;
  const prev = cairoClock(prevIso);
  const next = cairoClock(now.toISOString());
  const kept = previous instanceof Date ? previous : new Date(prevIso);
  if (!prev || !next || prev.ymd === next.ymd) return kept;
  if (next.ymd > prev.ymd && isLateTemimaConfirm(confirmedAt, cutoffs)) return now;
  return kept;
}
