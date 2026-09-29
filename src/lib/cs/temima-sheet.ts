import { addCairoYmdDays, cairoClock, cairoOffsetClock, isWithinCairoDateRange } from "@/lib/cs/order-window";

export type TemimaSheetEdit = {
  dayYmd: string;
  confirmationId: number;
  kind: "include" | "exclude";
};

export type TemimaSheetOrder = {
  id: number;
  shippingCompany?: string | null;
  confirmedAt?: string | Date | null;
  handedToCarrierAt?: string | Date | null;
};

export type TemimaCutoff = { dayYmd: string; minutes: number };

export function cutoffMinutes(hour: number, minute: number) {
  return hour * 60 + minute;
}

export function isValidTemimaCutoff(hour: number, minute: number) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false;
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;
  return true;
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

function isoOf(value: string | Date | null | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : value;
}

const SHEET_OPEN_MINUTES = 8 * 60;

type SheetOrder = {
  shippingCompany?: string | null;
  status?: string | null;
  confirmedAt?: string | Date | null;
  handedToCarrier?: boolean | null;
  handedToCarrierAt?: string | Date | null;
};

function temimaConfirmed(order: SheetOrder) {
  if (order.shippingCompany !== "sayed_temima") return false;
  if (order.status && order.status !== "CONFIRMED") return false;
  return true;
}

/** True once 08:00 Cairo of that sheet day has passed, including when the day itself is in the past. */
function sheetMorningOpen(dayYmd: string, now = new Date()) {
  const clock = cairoOffsetClock(now);
  if (!clock || !dayYmd) return false;
  if (clock.ymd > dayYmd) return true;
  if (clock.ymd < dayYmd) return false;
  return clock.minutes >= SHEET_OPEN_MINUTES;
}

/** Next calendar day when the first save is at or after that day's close. Later edits do not move it. */
function rolledSheetYmd(order: SheetOrder, cutoffs: TemimaCutoff[]) {
  if (!temimaConfirmed(order)) return null;
  const save = cairoOffsetClock(order.confirmedAt);
  if (!save) return null;
  const cutoff = cutoffs.find((row) => row.dayYmd === save.ymd) || null;
  if (!cutoff || save.minutes < cutoff.minutes) return null;
  return addCairoYmdDays(save.ymd, 1);
}

/** Sheet day from the first save. After a close, the order stays hidden until 08:00 the next morning. */
export function sayedSheetYmd(order: SheetOrder, cutoffs: TemimaCutoff[]): string | null {
  if (!temimaConfirmed(order)) return null;
  const rolled = rolledSheetYmd(order, cutoffs);
  if (rolled) return sheetMorningOpen(rolled) ? rolled : null;
  const save = cairoOffsetClock(order.confirmedAt);
  if (!save) return null;
  if (save.minutes < SHEET_OPEN_MINUTES) {
    const prevClosed = cutoffs.some((row) => row.dayYmd === addCairoYmdDays(save.ymd, -1));
    if (prevClosed && !sheetMorningOpen(save.ymd)) return null;
  }
  return save.ymd;
}

/** Handoff day when the transfer is before that day's close. A closed minute does not count. */
function handoffSheetYmd(order: SheetOrder, cutoffs: TemimaCutoff[]): string | null {
  if (!temimaConfirmed(order)) return null;
  if (order.handedToCarrier === false) return null;
  const hand = cairoOffsetClock(order.handedToCarrierAt);
  if (!hand) return null;
  const cutoff = cutoffs.find((row) => row.dayYmd === hand.ymd) || null;
  if (cutoff && hand.minutes >= cutoff.minutes) return null;
  return hand.ymd;
}

function editKind(confirmationId: number, dayYmd: string, edits: TemimaSheetEdit[]) {
  if (!dayYmd) return null;
  return edits.find((row) => row.confirmationId === confirmationId && row.dayYmd === dayYmd)?.kind || null;
}

function includedInRange(confirmationId: number, dateFrom: string, dateTo: string, edits: TemimaSheetEdit[]) {
  return edits.some(
    (row) =>
      row.confirmationId === confirmationId &&
      row.kind === "include" &&
      row.dayYmd >= dateFrom &&
      row.dayYmd <= dateTo,
  );
}

function naturalDayVisible(
  iso: string,
  confirmationId: number,
  dateFrom: string,
  dateTo: string,
  cutoffs: TemimaCutoff[],
  edits: TemimaSheetEdit[],
  late: boolean,
) {
  if (!iso || !isWithinCairoDateRange(iso, dateFrom, dateTo)) return false;
  const day = cairoClock(iso)?.ymd || "";
  if (editKind(confirmationId, day, edits) === "exclude") return false;
  return late ? isLateTemimaConfirm(iso, cutoffs) : isBeforeTemimaCutoff(iso, cutoffs);
}

/** One sheet membership: the sheet day, plus an admin include or exclude for that day. */
export function onUnifiedSayedSheet(
  order: TemimaSheetOrder & { status?: string | null; handedToCarrier?: boolean | null },
  dateFrom: string,
  dateTo: string,
  cutoffs: TemimaCutoff[],
  edits: TemimaSheetEdit[],
) {
  if (!dateFrom || !dateTo || !order.id) return false;
  if (dateFrom === dateTo) {
    const kind = editKind(order.id, dateFrom, edits);
    if (kind === "include") return true;
    if (kind === "exclude") return false;
  }
  const rolled = rolledSheetYmd(order, cutoffs);
  if (rolled) {
    if (
      sheetMorningOpen(rolled) &&
      rolled >= dateFrom &&
      rolled <= dateTo &&
      editKind(order.id, rolled, edits) !== "exclude"
    ) {
      return true;
    }
    return edits.some(
      (row) =>
        row.kind === "include" &&
        row.confirmationId === order.id &&
        row.dayYmd >= dateFrom &&
        row.dayYmd <= dateTo,
    );
  }
  const day = sayedSheetYmd(order, cutoffs);
  if (day && day >= dateFrom && day <= dateTo && editKind(order.id, day, edits) !== "exclude") return true;
  const handed = handoffSheetYmd(order, cutoffs);
  if (handed && handed >= dateFrom && handed <= dateTo && editKind(order.id, handed, edits) !== "exclude") return true;
  return edits.some(
    (row) =>
      row.kind === "include" &&
      row.confirmationId === order.id &&
      row.dayYmd >= dateFrom &&
      row.dayYmd <= dateTo,
  );
}

/** Admin include/exclude for a sheet day overrides the cutoff rule. */
export function onEditedSayedTemimaSheet(
  order: TemimaSheetOrder,
  dateFrom: string,
  dateTo: string,
  cutoffs: TemimaCutoff[],
  edits: TemimaSheetEdit[],
) {
  if (!dateFrom || !dateTo) return false;
  if (dateFrom === dateTo) {
    const kind = editKind(order.id, dateFrom, edits);
    if (kind === "include") return true;
    if (kind === "exclude") return false;
  } else if (includedInRange(order.id, dateFrom, dateTo, edits)) {
    return true;
  }
  if (order.shippingCompany && order.shippingCompany !== "sayed_temima") return false;
  const saved = naturalDayVisible(isoOf(order.confirmedAt), order.id, dateFrom, dateTo, cutoffs, edits, false);
  const handed = naturalDayVisible(isoOf(order.handedToCarrierAt), order.id, dateFrom, dateTo, cutoffs, edits, false);
  return saved || handed;
}

/** An included order leaves the second sheet. An excluded late order stays there. */
export function onEditedSecondTemimaSheet(
  order: TemimaSheetOrder,
  dateFrom: string,
  dateTo: string,
  cutoffs: TemimaCutoff[],
  edits: TemimaSheetEdit[],
) {
  if (!dateFrom || !dateTo) return false;
  if (dateFrom === dateTo && editKind(order.id, dateFrom, edits) === "include") return false;
  if (dateFrom !== dateTo && includedInRange(order.id, dateFrom, dateTo, edits)) return false;
  if (order.shippingCompany && order.shippingCompany !== "sayed_temima") return false;
  return onSecondTemimaSheet(order.confirmedAt, dateFrom, dateTo, cutoffs);
}
