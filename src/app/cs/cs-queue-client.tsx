"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { SHIPPING_COMPANY_LABEL } from "@/lib/cs/checklist";
import { getBostaStatusLabelAr } from "@/lib/shipping/bosta-zones";
import {
  cairoTodayYmd,
  cairoYesterdayYmd,
  formatCairoOrderDate,
  formatCairoOrderDateTime,
  isWithinCairoDateRange,
  resolvePaymentState,
  type CsPaymentState,
} from "@/lib/cs/order-window";
import { parseWooOrderNumber } from "@/lib/cs/assignments-client";
import {
  formatCutoffMinutes,
  onEditedSayedTemimaSheet,
  onEditedSecondTemimaSheet,
  type TemimaCutoff,
  type TemimaSheetEdit,
} from "@/lib/cs/temima-sheet";

export type CsQueueItem = {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  status: string;
  shippingCompany?: string | null;
  trackingNumber?: string | null;
  waybillPrinted?: boolean;
  depositAmount?: number | null;
  depositPaid?: boolean;
  depositApprovalStatus?: string | null;
  invoiceNumber?: string | null;
  bostaStatus?: string | null;
  bostaShippingFee?: number | null;
  handedToCarrier?: boolean;
  handedToCarrierAt?: string | null;
  deliveredToCustomer?: boolean;
  customerFollowUp?: boolean;
  assignedAgent?: { id?: number; name: string } | null;
  customerSnapshot?: {
    customerName?: string;
    phone?: string;
    address?: string;
    area?: string;
    governorate?: string;
    addressFull?: string;
    total?: string;
    dateCreated?: string;
    paymentMethod?: string;
    paymentMethodId?: string | null;
    paidOnlineHighlight?: boolean;
    paymentState?: CsPaymentState;
    datePaid?: string | null;
    wooStatus?: string;
    trackingNumber?: string | null;
    items?: Array<{ name: string; quantity?: number; sku?: string }>;
  } | null;
  startedAt?: string | null;
  confirmedAt?: string | null;
  confirmationEditedAt?: string | null;
  updatedAt?: string | null;
  distributedAt?: string | null;
  createdAt: string;
  shippingAssignedAt?: string | null;
  courierAgentId?: number | null;
  courierOutcome?: string | null;
  courierRefusalReason?: string | null;
};

const SAYED_TEMIMA_SHIPPING_EGP = 75;

function formatOrderNames(item: CsQueueItem) {
  const lines = item.customerSnapshot?.items || [];
  if (!lines.length) return "—";
  return lines
    .map((line) => {
      const name = String(line.name || "").trim();
      if (!name) return "";
      const qty = typeof line.quantity === "number" && line.quantity > 1 ? ` × ${line.quantity}` : "";
      return `${name}${qty}`;
    })
    .filter(Boolean)
    .join("\n");
}

function temimaMoney(item: CsQueueItem) {
  const total = parseOrderTotal(item.customerSnapshot?.total);
  const deposit =
    item.depositPaid && item.depositAmount && item.depositAmount > 0 ? Number(item.depositAmount) : 0;
  if (deposit > 0) {
    return { paid: deposit, remainder: Math.max(0, total - deposit) };
  }
  if (itemPaymentState(item) === "paid") {
    return { paid: total, remainder: 0 };
  }
  return { paid: 0, remainder: total };
}

function parseOrderTotal(value: string | null | undefined) {
  const n = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const dateMaxYmd = () => cairoTodayYmd();

function itemPaymentState(item: CsQueueItem): CsPaymentState {
  const snap = item.customerSnapshot;
  if (snap?.paymentState) return snap.paymentState;
  return resolvePaymentState({
    paymentMethod: snap?.paymentMethod,
    paymentMethodId: snap?.paymentMethodId,
    wooStatus: snap?.wooStatus,
    datePaid: snap?.datePaid,
  });
}

function clampDateFilters(f: DraftFilters): { filters: DraftFilters; warning: string } {
  const max = dateMaxYmd();
  let dateFrom = f.dateFrom || cairoYesterdayYmd();
  let dateTo = f.dateTo || max;
  let warning = "";

  if (dateTo > max) {
    dateTo = max;
    warning = "تاريخ النهاية لا يتجاوز اليوم.";
  }
  if (dateFrom > dateTo) {
    dateFrom = dateTo;
    warning = "تم ضبط تاريخ البداية ليطابق النهاية.";
  }

  return { filters: { ...f, dateFrom, dateTo }, warning };
}

const statusMeta: Record<string, { label: string; className: string }> = {
  PENDING: { label: "جديد", className: "bg-[#E5E5E5] text-[#14213D]" },
  IN_PROGRESS: { label: "جاري", className: "bg-[#14213D] text-white" },
  CONFIRMED: { label: "تم الحفظ", className: "bg-[#FCA311] text-black" },
  FAILED_CONTACT: { label: "لم يرد", className: "bg-black text-white" },
  CANCELLED: { label: "لاغى", className: "bg-red-700 text-white" },
};

const DUP_COLOR_CLASSES = [
  "bg-rose-100",
  "bg-sky-100",
  "bg-violet-100",
  "bg-amber-100",
  "bg-emerald-100",
  "bg-orange-100",
] as const;

type DraftFilters = {
  query: string;
  status: string;
  followUp: string;
  payment: string;
  shipping: string;
  agentId: string;
  dateFrom: string;
  dateTo: string;
  dateBasis: "created" | "saved" | "legacy";
  duplicates: "all" | "only";
  trackingFilter: "all" | "missing";
  waybillFilter: "all" | "not_printed";
};

type DupMeta = { key: string; count: number; colorClass: string };

const FILTER_CONTROL =
  "h-9 w-full rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2.5 text-xs font-bold text-[#14213D] outline-none focus:border-[#FCA311]";

function openDateField(event: React.MouseEvent<HTMLDivElement>) {
  const input = event.currentTarget.querySelector("input[type='date']");
  if (!(input instanceof HTMLInputElement)) return;
  input.focus();
  try {
    input.showPicker();
  } catch {
    // Picker already open, or this browser only opens it from the calendar control.
  }
}

function defaultDraft(): DraftFilters {
  return {
    query: "",
    status: "all",
    followUp: "all",
    payment: "all",
    shipping: "all",
    agentId: "all",
    dateFrom: cairoYesterdayYmd(),
    dateTo: cairoTodayYmd(),
    dateBasis: "created",
    duplicates: "all",
    trackingFilter: "all",
    waybillFilter: "all",
  };
}

function temimaSheetDraft(): DraftFilters {
  const today = cairoTodayYmd();
  return {
    ...defaultDraft(),
    status: "CONFIRMED",
    shipping: "sayed_temima",
    dateFrom: today,
    dateTo: today,
    dateBasis: "saved",
  };
}

function temimaDateMode(f: DraftFilters) {
  return f.shipping === "sayed_temima" && normalizeFilterStatus(f.status) === "CONFIRMED";
}

function applyCourierSupervisorSheet(
  items: CsQueueItem[],
  f: DraftFilters,
  afterLast: boolean,
  cutoffs: TemimaCutoff[],
  edits: TemimaSheetEdit[],
) {
  let rows = items.filter((item) => item.status === "CONFIRMED");
  const query = f.query.trim();
  if (query) rows = rows.filter((item) => matchesSearchQuery(item, query));
  if (f.dateFrom && f.dateTo) {
    rows = rows.filter((item) => onEditedSayedTemimaSheet(item, f.dateFrom, f.dateTo, cutoffs, edits));
  } else {
    rows = rows.filter((item) => item.shippingCompany === "sayed_temima");
  }
  if (f.payment === "paid" || f.payment === "paid_online" || f.payment === "paid_full") {
    rows = rows.filter((item) => itemPaymentState(item) === "paid");
  } else if (f.payment === "partial") {
    rows = rows.filter((item) => Number(item.depositAmount) > 0 && itemPaymentState(item) !== "paid");
  } else if (f.payment === "awaiting_payment") {
    rows = rows.filter((item) => itemPaymentState(item) === "awaiting_payment");
  } else if (f.payment === "cod") {
    rows = rows.filter((item) => itemPaymentState(item) === "cod" && !(Number(item.depositAmount) > 0));
  }
  if (f.status === "CONFIRMED" && f.followUp !== "all") {
    rows = rows.filter((item) => {
      if (f.followUp === "handed" && !item.handedToCarrier) return false;
      if (f.followUp === "delivered" && !item.deliveredToCustomer) return false;
      if (f.followUp === "followup" && !item.customerFollowUp) return false;
      if (f.followUp === "handed_pending" && item.handedToCarrier) return false;
      if (f.followUp === "delivered_pending" && item.deliveredToCustomer) return false;
      if (f.followUp === "followup_pending" && item.customerFollowUp) return false;
      return true;
    });
  }
  if (f.status === "COURIER_DELIVERED") rows = rows.filter((item) => item.courierOutcome === "delivered");
  else if (f.status === "COURIER_REFUSED") rows = rows.filter((item) => item.courierOutcome === "refused");
  else if (f.status === "COURIER_POSTPONED") rows = rows.filter((item) => item.courierOutcome === "postponed");
  else if (f.status === "UNDISTRIBUTED") rows = rows.filter((item) => !item.courierAgentId);
  if (afterLast) {
    const last = items.reduce((max, item) => {
      if (item.shippingCompany !== "sayed_temima" || item.status !== "CONFIRMED" || !item.courierAgentId) return max;
      return Math.max(max, parseWooOrderNumber(item.wooOrderNumber));
    }, 0);
    rows = rows.filter((item) => !item.courierAgentId && parseWooOrderNumber(item.wooOrderNumber) > last);
  }
  return rows.sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
}

function itemTrackingNumber(item: CsQueueItem) {
  return String(item.trackingNumber || item.customerSnapshot?.trackingNumber || "").trim();
}

function norm(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function phoneDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function phoneKey(item: CsQueueItem) {
  const digits = phoneDigits(item.customerSnapshot?.phone);
  if (digits.length >= 10) return `p:${digits.slice(-10)}`;
  if (digits.length >= 7) return `p:${digits}`;
  return "";
}

function nameKey(item: CsQueueItem) {
  const name = norm(item.customerSnapshot?.customerName);
  return name.length >= 2 ? `n:${name}` : "";
}

function colorForDupKey(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DUP_COLOR_CLASSES[h % DUP_COLOR_CLASSES.length];
}

/** Duplicate groups by phone, or by matching name+phone (within the given list). */
function buildDuplicateMeta(items: CsQueueItem[]): Map<number, DupMeta> {
  const byPhone = new Map<string, number[]>();
  const byNamePhone = new Map<string, number[]>();
  const byNameOnly = new Map<string, number[]>();

  for (const item of items) {
    const pk = phoneKey(item);
    const nk = nameKey(item);
    if (pk) {
      const list = byPhone.get(pk) || [];
      list.push(item.id);
      byPhone.set(pk, list);
    }
    if (nk && pk) {
      const key = `${nk}|${pk}`;
      const list = byNamePhone.get(key) || [];
      list.push(item.id);
      byNamePhone.set(key, list);
    }
    if (nk && !pk) {
      const list = byNameOnly.get(nk) || [];
      list.push(item.id);
      byNameOnly.set(nk, list);
    }
  }

  const meta = new Map<number, DupMeta>();
  for (const item of items) {
    const pk = phoneKey(item);
    const nk = nameKey(item);
    let key = "";
    let count = 0;
    if (pk && (byPhone.get(pk)?.length || 0) >= 2) {
      key = pk;
      count = byPhone.get(pk)!.length;
    } else if (nk && pk) {
      const np = `${nk}|${pk}`;
      if ((byNamePhone.get(np)?.length || 0) >= 2) {
        key = np;
        count = byNamePhone.get(np)!.length;
      }
    } else if (nk && (byNameOnly.get(nk)?.length || 0) >= 2) {
      key = nk;
      count = byNameOnly.get(nk)!.length;
    }
    if (key && count >= 2) {
      meta.set(item.id, { key, count, colorClass: colorForDupKey(key) });
    }
  }
  return meta;
}

function searchableText(item: CsQueueItem) {
  const snap = item.customerSnapshot;
  const products = (snap?.items || []).map((i) => i.name).join(" ");
  const phone = snap?.phone || "";
  const digits = phoneDigits(phone);
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return [
    item.wooOrderNumber,
    String(item.wooOrderId),
    item.status,
    item.shippingCompany,
    item.assignedAgent?.name,
    snap?.customerName,
    phone,
    digits,
    last10,
    snap?.address,
    snap?.addressFull,
    snap?.area,
    snap?.governorate,
    snap?.total,
    snap?.paymentMethod,
    snap?.trackingNumber,
    products,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesSearchQuery(item: CsQueueItem, rawQuery: string) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const hay = searchableText(item);
  if (hay.includes(q)) return true;
  const qDigits = phoneDigits(q);
  if (qDigits.length >= 4) {
    const phone = phoneDigits(item.customerSnapshot?.phone);
    if (phone.includes(qDigits) || phone.slice(-10).includes(qDigits.slice(-10))) return true;
    if (String(item.wooOrderNumber).includes(qDigits) || String(item.wooOrderId).includes(qDigits)) return true;
  }
  return false;
}

function normalizeFilterStatus(status: string) {
  if (status === "cancelled_or_no_answer") return "all";
  return status;
}

function itemWorkDateIsos(item: CsQueueItem): string[] {
  return [item.confirmedAt, item.startedAt, item.updatedAt, item.createdAt].filter(
    (v): v is string => Boolean(v && String(v).trim()),
  );
}

function itemMatchesDateFilter(item: CsQueueItem, f: DraftFilters, forAgentWorkDate: boolean) {
  if (!f.dateFrom || !f.dateTo) return true;
  if (temimaDateMode(f) && f.dateBasis !== "legacy") {
    const iso = f.dateBasis === "saved" ? item.confirmedAt : item.customerSnapshot?.dateCreated;
    return isWithinCairoDateRange(iso, f.dateFrom, f.dateTo);
  }
  if (forAgentWorkDate) {
    return itemWorkDateIsos(item).some((iso) => isWithinCairoDateRange(iso, f.dateFrom, f.dateTo));
  }
  return isWithinCairoDateRange(item.customerSnapshot?.dateCreated, f.dateFrom, f.dateTo);
}

function applyFilters(items: CsQueueItem[], f: DraftFilters, opts?: { isSupervisor?: boolean; orderDate?: boolean }) {
  const status = normalizeFilterStatus(f.status);
  const distributedOnly = status === "DISTRIBUTED";
  const forAgentWorkDate = !opts?.isSupervisor && !opts?.orderDate;
  return items
    .filter((item) => {
      if (distributedOnly) {
        if (!item.assignedAgent?.id || !item.distributedAt) return false;
        if (
          f.dateFrom &&
          f.dateTo &&
          !isWithinCairoDateRange(item.distributedAt, f.dateFrom, f.dateTo)
        ) {
          return false;
        }
      } else if (status !== "all" && item.status !== status) {
        return false;
      }
      if (status === "CONFIRMED" && f.followUp !== "all") {
        if (f.followUp === "handed" && !item.handedToCarrier) return false;
        if (f.followUp === "delivered" && !item.deliveredToCustomer) return false;
        if (f.followUp === "followup" && !item.customerFollowUp) return false;
        if (f.followUp === "handed_pending" && item.handedToCarrier) return false;
        if (f.followUp === "delivered_pending" && item.deliveredToCustomer) return false;
        if (f.followUp === "followup_pending" && item.customerFollowUp) return false;
      }
      if (f.payment === "paid" || f.payment === "paid_online") {
        if (itemPaymentState(item) !== "paid") return false;
      }
      if (f.payment === "awaiting_payment") {
        if (itemPaymentState(item) !== "awaiting_payment") return false;
      }
      if (f.payment === "cod") {
        if (itemPaymentState(item) !== "cod") return false;
      }
      if (f.shipping !== "all" && (item.shippingCompany || "") !== f.shipping) return false;
      if (f.agentId !== "all" && String(item.assignedAgent?.id || "") !== f.agentId) return false;
      if (!distributedOnly && !itemMatchesDateFilter(item, f, forAgentWorkDate)) return false;
      if (f.trackingFilter === "missing" && itemTrackingNumber(item)) return false;
      if (f.waybillFilter === "not_printed" && item.waybillPrinted) return false;
      return true;
    })
    .sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
}

function confirmedTemimaPrintRows(
  items: CsQueueItem[],
  applied: DraftFilters,
  query: string,
  opts: { isSupervisor?: boolean; isAccounting?: boolean },
) {
  const q = query.trim();
  const source = q
    ? items.filter((item) => matchesSearchQuery(item, q))
    : applyFilters(
        items,
        {
          ...applied,
          status: "CONFIRMED",
          shipping: "sayed_temima",
          dateBasis: temimaDateMode(applied) ? applied.dateBasis : "legacy",
        },
        {
          isSupervisor: Boolean(opts.isSupervisor),
          orderDate: Boolean(opts.isAccounting),
        },
      );
  return source.filter((item) => item.shippingCompany === "sayed_temima" && item.status === "CONFIRMED");
}

function handedTemimaPrintRows(
  items: CsQueueItem[],
  applied: DraftFilters,
  query: string,
  cutoffs: TemimaCutoff[],
  edits: TemimaSheetEdit[],
) {
  const q = query.trim();
  return items
    .filter((item) => {
      if (item.status !== "CONFIRMED") return false;
      if (!onEditedSayedTemimaSheet(item, applied.dateFrom, applied.dateTo, cutoffs, edits)) return false;
      if (!item.handedToCarrier && !item.handedToCarrierAt) return false;
      if (q && !matchesSearchQuery(item, q)) return false;
      return true;
    })
    .sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
}

function sayedTemimaPrintRows(
  items: CsQueueItem[],
  applied: DraftFilters,
  query: string,
  cutoffs: TemimaCutoff[],
  edits: TemimaSheetEdit[],
) {
  const q = query.trim();
  return items
    .filter((item) => {
      if (item.status !== "CONFIRMED") return false;
      if (q && !matchesSearchQuery(item, q)) return false;
      return onEditedSayedTemimaSheet(item, applied.dateFrom, applied.dateTo, cutoffs, edits);
    })
    .sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
}

function secondTemimaPrintRows(
  items: CsQueueItem[],
  applied: DraftFilters,
  query: string,
  cutoffs: TemimaCutoff[],
  edits: TemimaSheetEdit[],
) {
  const q = query.trim();
  return items
    .filter((item) => {
      if (item.status !== "CONFIRMED") return false;
      if (q && !matchesSearchQuery(item, q)) return false;
      return onEditedSecondTemimaSheet(item, applied.dateFrom, applied.dateTo, cutoffs, edits);
    })
    .sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
}

function mergeTemimaPrintRows(groups: CsQueueItem[][]) {
  const seen = new Set<number>();
  const merged: CsQueueItem[] = [];
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged.sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
}

function InvoiceBox({
  confirmationId,
  value,
  onSaved,
}: {
  confirmationId: number;
  value: string;
  onSaved: (next: string) => void;
}) {
  const [text, setText] = useState(value);
  const [hint, setHint] = useState("");
  const timer = useRef<number | null>(null);
  const saved = useRef(value);

  useEffect(() => {
    setText(value);
    saved.current = value;
  }, [value]);

  async function persist(next: string) {
    const trimmed = next.trim();
    if (trimmed === saved.current.trim()) return;
    setHint("حفظ...");
    const res = await fetch(`/api/cs/confirmations/${confirmationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceNumber: trimmed }),
    });
    const data = (await res.json()) as { message?: string; invoiceNumber?: string | null };
    if (!res.ok) {
      setHint(data.message || "تعذر الحفظ");
      return;
    }
    const stored = data.invoiceNumber || "";
    saved.current = stored;
    onSaved(stored);
    setHint("تم");
  }

  return (
    <label className="flex w-full min-w-[8rem] flex-col gap-0.5">
      <span className="text-[10px] font-bold text-[#14213D]/55">رقم الفاتورة</span>
      <input
        value={text}
        dir="ltr"
        placeholder="رقم الفاتورة"
        inputMode="numeric"
        maxLength={10}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 10);
          setText(next);
          setHint("");
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => void persist(next), 700);
        }}
        onBlur={() => {
          if (timer.current) window.clearTimeout(timer.current);
          void persist(text);
        }}
        className="h-9 w-full rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-xs font-bold text-[#14213D]"
      />
      {hint ? <span className="text-[10px] font-bold text-[#14213D]/60">{hint}</span> : null}
    </label>
  );
}

function TemimaCutoffBox({
  cutoffs,
  hour,
  minute,
  busy,
  onHour,
  onMinute,
  onLock,
}: {
  cutoffs: TemimaCutoff[];
  hour: string;
  minute: string;
  busy: boolean;
  onHour: (value: string) => void;
  onMinute: (value: string) => void;
  onLock: () => Promise<void>;
}) {
  const today = cutoffs.find((row) => row.dayYmd === cairoTodayYmd());
  const hours = Array.from({ length: 9 }, (_, index) => 8 + index);
  const minutes = hour === "16" ? [0] : Array.from({ length: 60 }, (_, index) => index);
  return (
    <form
      className="no-print flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10"
      onSubmit={(event) => {
        event.preventDefault();
        void onLock();
      }}
    >
      <p className="w-full text-sm font-extrabold text-[#14213D]">
        {today
          ? `شيت سيد مقفول النهاردة عند ${formatCutoffMinutes(today.minutes)}. تقدر تعدّلي الوقت لو اتقفل بالغلط.`
          : "قفل شيت سيد تميمة"}
      </p>
      <label className="text-xs font-bold text-[#14213D]">
        الساعة
        <select value={hour} onChange={(event) => onHour(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2">
          {hours.map((value) => (
            <option key={value} value={String(value)}>{value}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-bold text-[#14213D]">
        الدقيقة
        <select value={hour === "16" ? "0" : minute} onChange={(event) => onMinute(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2">
          {minutes.map((value) => (
            <option key={value} value={String(value)}>{String(value).padStart(2, "0")}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy} className="h-9 rounded-lg bg-[#FCA311] px-3 text-xs font-extrabold text-black disabled:opacity-60">
        {busy ? "حفظ..." : today ? "تعديل الوقت" : "قفل الشيت"}
      </button>
    </form>
  );
}

type Props = {
  initialItems: CsQueueItem[];
  isSupervisor?: boolean;
  isAccounting?: boolean;
  isCourierSupervisor?: boolean;
  canOpenOrders?: boolean;
  canSetTemimaCutoff?: boolean;
  canEditTemimaSheet?: boolean;
  temimaCutoffs?: TemimaCutoff[];
  temimaSheetEdits?: TemimaSheetEdit[];
  agents?: Array<{ id: number; name: string }>;
  couriers?: Array<{ id: number; name: string }>;
  initialHasMore?: boolean;
  initialNextCursor?: number | null;
};

type PrintMode = "none" | "bosta" | "sayed_temima" | "all";
type TemimaPrintScope = "confirmed" | "handed" | "all" | "late";

export function CsQueueClient({
  initialItems,
  isSupervisor,
  isAccounting,
  isCourierSupervisor,
  canOpenOrders = true,
  canSetTemimaCutoff = false,
  canEditTemimaSheet = false,
  temimaCutoffs = [],
  temimaSheetEdits = [],
  agents = [],
  couriers = [],
  initialHasMore = false,
  initialNextCursor = null,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(isCourierSupervisor ? temimaSheetDraft : defaultDraft);
  const [applied, setApplied] = useState<DraftFilters>(isCourierSupervisor ? temimaSheetDraft : defaultDraft);
  const [afterLastDistribution, setAfterLastDistribution] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>("none");
  const [printingCourierId, setPrintingCourierId] = useState<number | null>(null);
  const [courierPrintPick, setCourierPrintPick] = useState("");
  const [temimaAsk, setTemimaAsk] = useState(false);
  const [temimaScope, setTemimaScope] = useState<TemimaPrintScope>("all");
  const [cutoffs, setCutoffs] = useState<TemimaCutoff[]>(temimaCutoffs);
  const [sheetEdits, setSheetEdits] = useState<TemimaSheetEdit[]>(temimaSheetEdits);
  const [addOpen, setAddOpen] = useState(false);
  const [addOrders, setAddOrders] = useState("");
  const [sheetEditBusy, setSheetEditBusy] = useState(false);
  const savedCutoff = temimaCutoffs.find((row) => row.dayYmd === cairoTodayYmd());
  const [cutoffHour, setCutoffHour] = useState(savedCutoff ? String(Math.floor(savedCutoff.minutes / 60)) : "12");
  const [cutoffMinute, setCutoffMinute] = useState(savedCutoff ? String(savedCutoff.minutes % 60) : "0");
  const [cutoffBusy, setCutoffBusy] = useState(false);
  const [savingShipId, setSavingShipId] = useState<number | null>(null);

  const syncingRef = useRef(false);
  const loadedMoreRef = useRef(false);
  const searchWasActive = useRef(false);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;
  const draftQueryRef = useRef(draft.query);
  draftQueryRef.current = draft.query;
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<number | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setItems(initialItems);
    setHasMore(initialHasMore);
    setNextCursor(initialNextCursor);
    loadedMoreRef.current = false;
  }, [initialItems, initialHasMore, initialNextCursor]);

  async function loadQueue(opts: {
    query: string;
    dateFrom: string;
    dateTo: string;
    cursorId: number | null;
    append: boolean;
  }) {
    const params = new URLSearchParams();
    const query = opts.query.trim();
    if (query) params.set("q", query);
    if (!query && opts.dateFrom) params.set("from", opts.dateFrom);
    if (!query && opts.dateTo) params.set("to", opts.dateTo);
    if (opts.cursorId) params.set("cursor", String(opts.cursorId));
    const res = await fetch(`/api/cs/orders?${params.toString()}`);
    const data = (await res.json()) as { message?: string; items?: CsQueueItem[]; hasMore?: boolean; nextCursor?: number | null };
    if (!res.ok) {
      setMessage(data.message || "تعذر تحميل الأوردرات.");
      return;
    }
    const nextItems = data.items || [];
    setItems((prev) => (opts.append ? [...prev, ...nextItems] : nextItems));
    setHasMore(Boolean(data.hasMore));
    setNextCursor(data.nextCursor ?? null);
    loadedMoreRef.current = opts.append;
  }

  async function syncOrders(opts?: { quiet?: boolean }) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (!opts?.quiet) {
      setLoading(true);
      setMessage("");
    }
    try {
      const res = await fetch("/api/cs/sync", { method: "POST" });
      const data = (await res.json()) as { message?: string; imported?: number };
      if (!res.ok) {
        if (!opts?.quiet) setMessage(data.message || "تعذر المزامنة.");
        return;
      }
      if (!opts?.quiet) setMessage(`تمت المزامنة. طلبات جديدة: ${data.imported ?? 0}`);
      if (isCourierSupervisor) {
        if (!opts?.quiet || (data.imported ?? 0) > 0) router.refresh();
        return;
      }
      const query = draftQueryRef.current.trim();
      if (!query && !loadedMoreRef.current) {
        const filters = appliedRef.current;
        await loadQueue({
          query: "",
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          cursorId: null,
          append: false,
        });
      }
      if (opts?.quiet && (data.imported ?? 0) > 0) {
        setMessage(`مزامنة تلقائية: طلبات جديدة ${data.imported}`);
      }
    } finally {
      syncingRef.current = false;
      if (!opts?.quiet) setLoading(false);
    }
  }

  // Auto-sync every 30 seconds
  useEffect(() => {
    const id = window.setInterval(() => {
      void syncOrders({ quiet: true });
    }, 30000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isCourierSupervisor) return;
    const handle = window.setTimeout(() => {
      const query = draft.query.trim();
      if (!query) {
        if (!searchWasActive.current) return;
        searchWasActive.current = false;
        const filters = appliedRef.current;
        void loadQueue({
          query: "",
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          cursorId: null,
          append: false,
        });
        return;
      }
      searchWasActive.current = true;
      void loadQueue({
        query,
        dateFrom: "",
        dateTo: "",
        cursorId: null,
        append: false,
      });
    }, 400);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.query, isCourierSupervisor]);

  // Search is live and independent of other filters: when query is set, match all loaded items.
  const baseFiltered = useMemo(() => {
    if (isCourierSupervisor) {
      return applyCourierSupervisorSheet(items, { ...applied, query: draft.query }, afterLastDistribution, cutoffs, sheetEdits);
    }
    const q = draft.query.trim();
    if (q) {
      return items
        .filter((item) => matchesSearchQuery(item, q))
        .sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
    }
    return applyFilters(items, applied, { isSupervisor: Boolean(isSupervisor), orderDate: Boolean(isAccounting) });
  }, [items, draft.query, applied, isSupervisor, isAccounting, isCourierSupervisor, afterLastDistribution, cutoffs, sheetEdits]);

  const dupMeta = useMemo(() => buildDuplicateMeta(baseFiltered), [baseFiltered]);

  const filtered = useMemo(() => {
    const wantDupOnly = Boolean(isSupervisor) && draft.duplicates === "only";
    let list = baseFiltered;
    if (wantDupOnly) {
      list = baseFiltered.filter((item) => dupMeta.has(item.id));
      list = [...list].sort((a, b) => {
        const ka = dupMeta.get(a.id)?.key || "";
        const kb = dupMeta.get(b.id)?.key || "";
        if (ka !== kb) return ka.localeCompare(kb);
        return parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber);
      });
    }
    return list;
  }, [baseFiltered, dupMeta, draft.duplicates, isSupervisor]);

  const printRows = useMemo(() => {
    if (printingCourierId) {
      return filtered.filter((item) => item.courierAgentId === printingCourierId);
    }
    if (printMode === "bosta") return filtered.filter((i) => i.shippingCompany === "bosta");
    if (printMode === "sayed_temima") {
      if (isCourierSupervisor && temimaScope === "confirmed") {
        return applyCourierSupervisorSheet(items, { ...applied, query: draft.query, status: "CONFIRMED" }, false, cutoffs, sheetEdits);
      }
      const confirmed = confirmedTemimaPrintRows(items, applied, draft.query, {
        isSupervisor,
        isAccounting,
      });
      if (isSupervisor && !isCourierSupervisor) {
        const sayed = sayedTemimaPrintRows(items, applied, draft.query, cutoffs, sheetEdits);
        if (temimaScope === "confirmed") return sayed;
        const handed = handedTemimaPrintRows(items, applied, draft.query, cutoffs, sheetEdits);
        if (temimaScope === "handed") return handed;
        if (temimaScope === "late") return secondTemimaPrintRows(items, applied, draft.query, cutoffs, sheetEdits);
        return mergeTemimaPrintRows([sayed, handed]);
      }
      if (temimaScope === "confirmed") return confirmed;
      return filtered.filter((i) => i.shippingCompany === "sayed_temima");
    }
    return filtered;
  }, [filtered, printMode, temimaScope, draft.query, items, applied, isSupervisor, isAccounting, isCourierSupervisor, printingCourierId, cutoffs, sheetEdits]);

  useEffect(() => {
    if (printMode === "none") return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintMode("none");
      setPrintingCourierId(null);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [printMode]);

  function openOrder(id: number) {
    router.push(`/cs/orders/${id}`);
  }

  async function setShipping(id: number, shippingCompany: "bosta" | "sayed_temima") {
    setSavingShipId(id);
    setMessage("");
    // Optimistic UI
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, shippingCompany } : item)));
    const res = await fetch(`/api/cs/confirmations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shippingCompany }),
    });
    const data = (await res.json()) as { message?: string; shippingCompany?: string | null };
    setSavingShipId(null);
    if (!res.ok) {
      setMessage(data.message || "تعذر حفظ شركة الشحن.");
      router.refresh();
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, shippingCompany: data.shippingCompany || shippingCompany } : item,
      ),
    );
  }

  function patchDraft(patch: Partial<DraftFilters>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function runFilter() {
    const { filters, warning } = clampDateFilters({
      ...draft,
      status: normalizeFilterStatus(draft.status),
    });
    setDraft(filters);
    setApplied(filters);
    if (warning) setMessage(warning);
    if (!isCourierSupervisor) {
      void loadQueue({
        query: filters.query.trim(),
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        cursorId: null,
        append: false,
      });
    }
  }

  const sheetDay = applied.dateFrom && applied.dateFrom === applied.dateTo ? applied.dateFrom : "";

  function rememberEdits(next: TemimaSheetEdit[]) {
    setSheetEdits((prev) => {
      const kept = prev.filter(
        (row) => !next.some((item) => item.dayYmd === row.dayYmd && item.confirmationId === row.confirmationId),
      );
      return [...kept, ...next];
    });
  }

  async function addSheetOrders() {
    if (!sheetDay || sheetEditBusy) return;
    setSheetEditBusy(true);
    setMessage("");
    const res = await fetch("/api/cs/temima-sheet-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "include", dayYmd: sheetDay, orderNumbers: addOrders }),
    });
    const data = (await res.json()) as {
      message?: string;
      edits?: TemimaSheetEdit[];
      items?: CsQueueItem[];
    };
    setSheetEditBusy(false);
    if (!res.ok || !data.edits) {
      setMessage(data.message || "تعذر إضافة الأوردر.");
      return;
    }
    rememberEdits(data.edits);
    if (data.items?.length) {
      setItems((prev) => {
        const next = [...prev];
        for (const item of data.items || []) {
          const index = next.findIndex((row) => row.id === item.id);
          if (index >= 0) next[index] = item;
          else next.push(item);
        }
        return next;
      });
    }
    setAddOrders("");
    setAddOpen(false);
    setMessage(data.message || "اتضاف الأوردر.");
  }

  async function removeSheetOrder(confirmationId: number) {
    if (!sheetDay || sheetEditBusy) return;
    setSheetEditBusy(true);
    setMessage("");
    const res = await fetch("/api/cs/temima-sheet-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "exclude", dayYmd: sheetDay, confirmationId }),
    });
    const data = (await res.json()) as { message?: string; edit?: TemimaSheetEdit };
    setSheetEditBusy(false);
    if (!res.ok || !data.edit) {
      setMessage(data.message || "تعذر حذف الأوردر.");
      return;
    }
    rememberEdits([data.edit]);
    setItems((prev) =>
      prev.map((item) =>
        item.id === confirmationId
          ? { ...item, courierAgentId: null, courierOutcome: null, courierRefusalReason: null }
          : item,
      ),
    );
  }

  function resetFilters() {
    const next = isCourierSupervisor ? temimaSheetDraft() : defaultDraft();
    setDraft(next);
    setApplied(next);
    setAfterLastDistribution(false);
    setMessage("");
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="no-print flex flex-col gap-3 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/15 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-4">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-[#14213D] sm:text-2xl">
            {isCourierSupervisor ? "شيت سيد تميمة" : "قائمة تأكيد الطلبات"}
          </h1>
          <p className="mt-1 text-sm font-bold text-[#14213D]/70">
            عدد النتائج: <span className="rounded bg-[#14213D] px-2 py-0.5 text-[#FCA311]">{filtered.length}</span>
            {isCourierSupervisor ? null : <> من أصل {items.length}</>}
          </p>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
          {isSupervisor && !isCourierSupervisor ? (
            <Link
              href="/cs/assign"
              className="shrink-0 rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white sm:px-4 sm:py-2.5 sm:text-sm"
            >
              توزيع
            </Link>
          ) : null}
          {isCourierSupervisor ? null : (
          <button
            type="button"
            onClick={() => setPrintMode("bosta")}
            className="shrink-0 rounded-xl bg-black px-3 py-2 text-xs font-extrabold text-white sm:py-2.5 sm:text-sm"
          >
            طباعة بوسطة
          </button>
          )}
          {isCourierSupervisor ? (
            <Link
              href="/cs/temima-scan"
              className="shrink-0 rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white sm:py-2.5 sm:text-sm"
            >
              استلام بالسكان
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setPrintingCourierId(null);
              setTemimaAsk(true);
            }}
            className="shrink-0 rounded-xl bg-black px-3 py-2 text-xs font-extrabold text-white sm:py-2.5 sm:text-sm"
          >
            طباعة تميمة
          </button>
          {isCourierSupervisor ? (
            <div className="flex shrink-0 items-center gap-2">
              <select
                value={courierPrintPick}
                onChange={(e) => setCourierPrintPick(e.target.value)}
                className="h-9 rounded-xl border border-[#E5E5E5] bg-white px-2 text-xs font-extrabold text-[#14213D]"
              >
                <option value="">اسم المندوب</option>
                {couriers.map((courier) => (
                  <option key={courier.id} value={String(courier.id)}>
                    {courier.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!courierPrintPick}
                onClick={() => {
                  setPrintingCourierId(Number(courierPrintPick));
                  setPrintMode("sayed_temima");
                }}
                className="rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50 sm:py-2.5 sm:text-sm"
              >
                طباعة المندوب
              </button>
            </div>
          ) : (
          <button
            type="button"
            onClick={() => setPrintMode("all")}
            className="shrink-0 rounded-xl bg-[#E5E5E5] px-3 py-2 text-xs font-extrabold text-[#14213D] sm:py-2.5 sm:text-sm"
          >
            طباعة الكل
          </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void syncOrders()}
            className="shrink-0 rounded-xl bg-[#FCA311] px-3 py-2 text-xs font-extrabold text-black disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
          >
            {loading ? "مزامنة..." : "مزامنة"}
          </button>
        </div>
      </div>

      {temimaAsk ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
          <p className="text-sm font-extrabold text-[#14213D]">طباعة تميمة:</p>
          <button
            type="button"
            onClick={() => {
              setTemimaScope("confirmed");
              setTemimaAsk(false);
              setPrintMode("sayed_temima");
            }}
            className="rounded-xl bg-[#FCA311] px-3 py-2 text-xs font-extrabold text-black"
          >
            المؤكد
          </button>
          {isSupervisor && !isCourierSupervisor ? (
            <button
              type="button"
              onClick={() => {
                setTemimaScope("handed");
                setTemimaAsk(false);
                setPrintMode("sayed_temima");
              }}
              className="rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white"
            >
              تم تسليمه
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setTemimaScope("all");
              setTemimaAsk(false);
              setPrintMode("sayed_temima");
            }}
            className="rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white"
          >
            الكل
          </button>
          {isSupervisor && !isCourierSupervisor ? (
            <button
              type="button"
              onClick={() => {
                setTemimaScope("late");
                setTemimaAsk(false);
                setPrintMode("sayed_temima");
              }}
              className="rounded-xl bg-[#E5E5E5] px-3 py-2 text-xs font-extrabold text-[#14213D]"
            >
              الشيت التاني
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setTemimaAsk(false)}
            className="rounded-xl bg-[#E5E5E5] px-3 py-2 text-xs font-extrabold text-[#14213D]"
          >
            إلغاء
          </button>
        </div>
      ) : null}

      {canSetTemimaCutoff ? (
        <TemimaCutoffBox
          cutoffs={cutoffs}
          hour={cutoffHour}
          minute={cutoffMinute}
          busy={cutoffBusy}
          onHour={(value) => {
            setCutoffHour(value);
            if (value === "16") setCutoffMinute("0");
          }}
          onMinute={setCutoffMinute}
          onLock={async () => {
            setCutoffBusy(true);
            setMessage("");
            const hadToday = cutoffs.some((row) => row.dayYmd === cairoTodayYmd());
            const res = await fetch("/api/cs/temima-cutoff", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ hour: Number(cutoffHour), minute: cutoffHour === "16" ? 0 : Number(cutoffMinute) }),
            });
            const data = (await res.json()) as { message?: string; dayYmd?: string; minutes?: number };
            setCutoffBusy(false);
            if (!res.ok || !data.dayYmd || data.minutes == null) {
              setMessage(data.message || "تعذر حفظ الوقت.");
              return;
            }
            setCutoffs((prev) => {
              const next = prev.filter((row) => row.dayYmd !== data.dayYmd);
              next.push({ dayYmd: data.dayYmd as string, minutes: data.minutes as number });
              return next;
            });
            const clock = formatCutoffMinutes(data.minutes);
            setMessage(hadToday ? `اتعدل وقت قفل الشيت إلى ${clock}.` : `شيت سيد اتقفل النهاردة عند ${clock}.`);
          }}
        />
      ) : null}

      <div className="no-print space-y-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8">
          <input
            value={draft.query}
            onChange={(e) => patchDraft({ query: e.target.value })}
            placeholder="بحث: موبايل، اسم، عنوان، منتج..."
            className={`${FILTER_CONTROL} col-span-2 sm:col-span-3 lg:col-span-2 xl:col-span-2`}
          />
          <select
            value={normalizeFilterStatus(draft.status)}
            onChange={(e) => patchDraft({ status: e.target.value, followUp: "all" })}
            className={FILTER_CONTROL}
          >
            <option value="all">حالة الأوردر</option>
            {isCourierSupervisor ? (
              <>
                <option value="CONFIRMED">المؤكد</option>
                <option value="COURIER_DELIVERED">تم التسليم</option>
                <option value="COURIER_REFUSED">تم الرفض</option>
                <option value="COURIER_POSTPONED">تأجيل</option>
                <option value="UNDISTRIBUTED">لم يوزع</option>
              </>
            ) : (
              <>
            <option value="PENDING">جديد</option>
            <option value="IN_PROGRESS">جاري</option>
            <option value="CONFIRMED">تم الحفظ</option>
            <option value="FAILED_CONTACT">لم يرد</option>
            <option value="CANCELLED">لاغى</option>
            <option value="DISTRIBUTED">موزع</option>
              </>
            )}
          </select>
          {isCourierSupervisor ? (
            <select
              value={draft.payment}
              onChange={(e) => patchDraft({ payment: e.target.value })}
              className={FILTER_CONTROL}
            >
              <option value="all">كل الدفع</option>
              <option value="paid_full">مدفوع بالكامل</option>
              <option value="partial">دفع جزئي</option>
              <option value="cod">عند الاستلام</option>
            </select>
          ) : draft.status === "CONFIRMED" ? (
            <select
              value={draft.followUp}
              onChange={(e) => patchDraft({ followUp: e.target.value })}
              className={FILTER_CONTROL}
            >
              <option value="all">كل المتابعة</option>
              <option value="handed">تم التسليم لشركة الشحن</option>
              <option value="delivered">تم التسليم للعميل</option>
              <option value="followup">متابعة العميل</option>
              <option value="handed_pending">بانتظار تسليم الشحن</option>
              <option value="delivered_pending">بانتظار تأكيد التسليم</option>
              <option value="followup_pending">بانتظار المتابعة</option>
            </select>
          ) : (
            <select
              value={draft.payment}
              onChange={(e) => patchDraft({ payment: e.target.value })}
              className={FILTER_CONTROL}
            >
              <option value="all">كل الدفع</option>
              <option value="paid">مدفوع</option>
              <option value="awaiting_payment">تحت الدفع</option>
              <option value="cod">عند الاستلام</option>
            </select>
          )}
          {!isCourierSupervisor && draft.status === "CONFIRMED" ? (
            <select
              value={draft.payment}
              onChange={(e) => patchDraft({ payment: e.target.value })}
              className={FILTER_CONTROL}
            >
              <option value="all">كل الدفع</option>
              <option value="paid">مدفوع</option>
              <option value="awaiting_payment">تحت الدفع</option>
              <option value="cod">عند الاستلام</option>
            </select>
          ) : null}
          {isCourierSupervisor ? null : (
          <select
            value={draft.shipping}
            onChange={(e) => patchDraft({ shipping: e.target.value })}
            className={FILTER_CONTROL}
          >
            <option value="all">كل شركات الشحن</option>
            <option value="bosta">بوسطة</option>
            <option value="sayed_temima">سيد تميمة</option>
          </select>
          )}
          {isCourierSupervisor || !temimaDateMode(draft) ? null : (
            <select
              value={draft.dateBasis}
              onChange={(e) => patchDraft({ dateBasis: e.target.value === "saved" ? "saved" : "created" })}
              className={FILTER_CONTROL}
            >
              <option value="created">تاريخ إنشاء الأوردر</option>
              <option value="saved">تاريخ حفظ الأوردر</option>
            </select>
          )}
          <div className={`${FILTER_CONTROL} cs-date-field flex cursor-pointer items-center gap-1.5`} onClick={openDateField}>
            <span className="pointer-events-none shrink-0 text-[#14213D]/60">من</span>
            <input
              type="date"
              max={dateMaxYmd()}
              value={draft.dateFrom}
              onChange={(e) => patchDraft({ dateFrom: e.target.value })}
              className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
            />
          </div>
          <div className={`${FILTER_CONTROL} cs-date-field flex cursor-pointer items-center gap-1.5`} onClick={openDateField}>
            <span className="pointer-events-none shrink-0 text-[#14213D]/60">إلى</span>
            <input
              type="date"
              max={dateMaxYmd()}
              value={draft.dateTo}
              onChange={(e) => patchDraft({ dateTo: e.target.value })}
              className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
            />
          </div>
          {isCourierSupervisor ? null : (
          <select
            value={draft.trackingFilter}
            onChange={(e) =>
              patchDraft({ trackingFilter: e.target.value === "missing" ? "missing" : "all" })
            }
            className={FILTER_CONTROL}
          >
            <option value="all">كل أرقام التراك</option>
            <option value="missing">بدون رقم تراك</option>
          </select>
          )}
          {isCourierSupervisor ? null : (
          <select
            value={draft.waybillFilter}
            onChange={(e) =>
              patchDraft({ waybillFilter: e.target.value === "not_printed" ? "not_printed" : "all" })
            }
            className={FILTER_CONTROL}
          >
            <option value="all">كل البوالص</option>
            <option value="not_printed">لم تُطبع البوليصة</option>
          </select>
          )}
          {isSupervisor ? (
            <select
              value={draft.agentId}
              onChange={(e) => patchDraft({ agentId: e.target.value })}
              className={FILTER_CONTROL}
            >
              <option value="all">أسماء مسئولى خدمة العملاء</option>
              {agents.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : null}
          {isSupervisor ? (
            <select
              value={draft.duplicates}
              onChange={(e) => patchDraft({ duplicates: e.target.value === "only" ? "only" : "all" })}
              className={FILTER_CONTROL}
            >
              <option value="all">كل الأوردرات</option>
              <option value="only">المكررة فقط</option>
            </select>
          ) : null}
          <div className="col-span-2 flex flex-wrap items-stretch gap-2 sm:col-span-1">
            <button
              type="button"
              onClick={runFilter}
              className="h-9 flex-1 rounded-lg bg-[#FCA311] px-3 text-xs font-extrabold text-black"
            >
              فلتر
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-9 rounded-lg bg-[#E5E5E5] px-3 text-xs font-bold text-[#14213D]"
            >
              إعادة
            </button>
          </div>
          {isCourierSupervisor ? (
            <label className="col-span-2 flex items-center gap-2 text-xs font-bold text-[#14213D] sm:col-span-3">
              <input
                type="checkbox"
                className="size-4 accent-[#FCA311]"
                checked={afterLastDistribution}
                onChange={(event) => setAfterLastDistribution(event.target.checked)}
              />
              إظهار الأوردرات المطلوب توزيعها بعد آخر توزيع
            </label>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className="no-print rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p>
      ) : null}

      {isCourierSupervisor ? null : (
        <p className="no-print text-sm font-extrabold text-[#14213D]">نتائج الجدول: {filtered.length} أوردر</p>
      )}

      {canEditTemimaSheet && sheetDay ? (
        <form
          className="no-print grid gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10"
          onSubmit={(event) => {
            event.preventDefault();
            void addSheetOrders();
          }}
        >
          <button
            type="button"
            onClick={() => setAddOpen((open) => !open)}
            className="h-9 w-9 rounded-xl bg-[#14213D] text-lg font-extrabold text-white"
          >
            +
          </button>
          {addOpen ? (
            <div className="flex flex-wrap items-end gap-2">
              <textarea
                value={addOrders}
                onChange={(event) => setAddOrders(event.target.value)}
                placeholder="رقم الأوردر أو أكتر"
                rows={2}
                className="min-w-[12rem] flex-1 rounded-xl border border-[#E5E5E5] bg-[#F5F5F0] px-3 py-2 text-sm font-bold"
              />
              <button type="submit" disabled={sheetEditBusy} className="h-10 rounded-xl bg-[#FCA311] px-3 text-sm font-extrabold text-black disabled:opacity-60">
                إضافة
              </button>
            </div>
          ) : null}
        </form>
      ) : null}

      <div className="no-print space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white px-4 py-10 text-center text-[#14213D]/70">
            {items.length === 0 ? (
              isCourierSupervisor ? (
                <p className="font-bold">مفيش أوردرات مؤكدة لسيد تميمة في اليوم ده.</p>
              ) : isSupervisor || isAccounting ? (
                <p className="font-bold">لا توجد طلبات — راجعي المزامنة أو وسّعي تاريخ الفلتر.</p>
              ) : (
                <p className="font-bold">لم يُوزَّع عليكِ أوردرات بعد — اطلبي من المشرفة التوزيع.</p>
              )
            ) : (
              <p className="font-bold">لا توجد نتائج مطابقة للبحث أو الفلتر — جرّبي مسح البحث أو «إعادة».</p>
            )}
          </div>
        ) : (
          filtered.map((item) => {
            const isConfirmed = item.status === "CONFIRMED";
            const paymentState = itemPaymentState(item);
            const isPaid = paymentState === "paid";
            const isAwaiting = paymentState === "awaiting_payment";
            const meta = statusMeta[item.status] || { label: item.status, className: "bg-[#E5E5E5]" };
            const day = formatCairoOrderDate(item.customerSnapshot?.dateCreated);
            const ship = item.shippingCompany === "sayed_temima" ? "sayed_temima" : "bosta";
            const dup = dupMeta.get(item.id);

            return (
              <div
                key={item.id}
                className={`rounded-xl px-3 py-2.5 shadow-sm ring-1 ${
                  dup ? dup.colorClass : "bg-white"
                } ${
                  isConfirmed
                    ? "ring-[#FCA311]"
                    : isPaid
                      ? "ring-[#14213D]/35"
                      : isAwaiting
                        ? "ring-amber-400/70"
                        : "ring-[#E5E5E5]"
                }`}
              >
                <div
                  className={`grid gap-x-2 gap-y-2 text-sm font-bold text-[#14213D] ${
                    isSupervisor && isAccounting
                      ? "grid-cols-2 sm:grid-cols-7"
                      : isSupervisor || isAccounting
                        ? "grid-cols-2 sm:grid-cols-6"
                        : "grid-cols-2 sm:grid-cols-4"
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] ${meta.className}`}>{meta.label}</span>
                    <span className="flex items-center gap-2 text-base font-extrabold">
                      #{item.wooOrderNumber}
                      {canEditTemimaSheet && sheetDay ? (
                        <button
                          type="button"
                          disabled={sheetEditBusy}
                          onClick={() => void removeSheetOrder(item.id)}
                          className="rounded bg-red-700 px-1.5 py-0.5 text-[11px] font-extrabold text-white disabled:opacity-60"
                        >
                          x
                        </button>
                      ) : null}
                    </span>
                    <span className="text-xs text-[#14213D]/55">{day}</span>
                    {item.shippingCompany === "sayed_temima" && item.status === "CONFIRMED" && item.confirmedAt ? (
                      <span className="text-[11px] font-bold text-[#14213D]/70">
                        حُفظ {formatCairoOrderDateTime(item.confirmedAt).absolute}
                        {item.confirmationEditedAt
                          ? ` · عُدّل ${formatCairoOrderDateTime(item.confirmationEditedAt).absolute}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span>{item.customerSnapshot?.customerName || "—"}</span>
                    <span className="flex flex-wrap items-center gap-1 text-xs" dir="ltr">
                      {item.customerSnapshot?.phone || ""}
                      {dup ? (
                        <span className="rounded bg-[#14213D] px-1.5 py-0.5 text-[10px] font-extrabold text-[#FCA311]" dir="rtl">
                          ×{dup.count} مكرر
                        </span>
                      ) : null}
                    </span>
                    {isPaid ? (
                      <span className="w-fit rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">مدفوع</span>
                    ) : null}
                    {isAwaiting ? (
                      <span className="w-fit rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-black">تحت الدفع</span>
                    ) : null}
                    {itemTrackingNumber(item) ? (
                      <span className="w-fit rounded bg-[#14213D] px-1.5 py-0.5 text-[10px] text-white" dir="ltr">
                        تراك: {itemTrackingNumber(item)}
                      </span>
                    ) : null}
                    {item.waybillPrinted ? (
                      <span className="w-fit rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">بوليصة طُبعت</span>
                    ) : null}
                    {item.courierOutcome === "delivered" ? (
                      <span className="w-fit rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">تم التسليم</span>
                    ) : null}
                    {item.courierOutcome === "refused" ? (
                      <span className="w-fit rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-800">
                        تم الرفض{item.courierRefusalReason ? `: ${item.courierRefusalReason}` : ""}
                      </span>
                    ) : null}
                    {item.courierOutcome === "postponed" ? (
                      <span className="w-fit rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-900">تأجيل</span>
                    ) : null}
                    {isCourierSupervisor && !item.courierAgentId ? (
                      <span className="w-fit rounded bg-[#E5E5E5] px-1.5 py-0.5 text-[10px] text-[#14213D]">لم يوزع</span>
                    ) : null}
                    {item.depositApprovalStatus === "pending" ? (
                      <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
                        بانتظار ديبوزت
                      </span>
                    ) : null}
                    {item.depositAmount != null && item.depositAmount > 0 ? (
                      <span className="w-fit rounded bg-[#14213D]/10 px-1.5 py-0.5 text-[10px] text-[#14213D]" dir="ltr">
                        مقدم: {item.depositAmount}
                      </span>
                    ) : null}
                    {item.depositPaid || item.depositApprovalStatus === "approved" ? (
                      <span className="w-fit rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">مقدم مؤكد</span>
                    ) : null}
                    {item.depositApprovalStatus === "rejected" ? (
                      <span className="w-fit rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-800">ديبوزت مرفوض</span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5 sm:col-span-1">
                    <span className="text-xs leading-snug text-[#14213D]/80">
                      {item.customerSnapshot?.addressFull ||
                        item.customerSnapshot?.address ||
                        "—"}
                    </span>
                    {item.customerSnapshot?.governorate && item.customerSnapshot?.area ? (
                      <span className="text-[11px] text-[#14213D]/55">
                        {item.customerSnapshot.governorate} · {item.customerSnapshot.area}
                      </span>
                    ) : null}
                    {!isSupervisor ? (
                      <span className="text-xs text-[#14213D]/70">
                        شحن: {SHIPPING_COMPANY_LABEL[ship] || ship}
                      </span>
                    ) : null}
                  </div>
                  {isSupervisor ? (
                    <div className="flex items-center justify-center gap-2 self-center">
                      <label className="flex items-center gap-1 text-[10px] font-bold text-[#14213D]">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-[#FCA311]"
                          checked={ship === "bosta"}
                          disabled={savingShipId === item.id}
                          onChange={() => void setShipping(item.id, "bosta")}
                        />
                        بوسطة
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-bold text-[#14213D]">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-[#FCA311]"
                          checked={ship === "sayed_temima"}
                          disabled={savingShipId === item.id}
                          onChange={() => void setShipping(item.id, "sayed_temima")}
                        />
                        تميمة
                      </label>
                    </div>
                  ) : null}
                  {isSupervisor || isAccounting ? (
                    <div className="flex min-w-[5.5rem] items-center justify-center self-center rounded-lg bg-[#F5F5F0] px-2 py-1 text-center">
                      <span className="text-sm font-extrabold leading-tight text-[#14213D]">
                        {item.assignedAgent?.name || "—"}
                      </span>
                    </div>
                  ) : null}
                  {isAccounting ? (
                    <div className="flex items-center self-center">
                      <InvoiceBox
                        confirmationId={item.id}
                        value={item.invoiceNumber || ""}
                        onSaved={(next) =>
                          setItems((prev) =>
                            prev.map((row) => (row.id === item.id ? { ...row, invoiceNumber: next || null } : row)),
                          )
                        }
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-col items-start gap-1.5 sm:items-end">
                    <span className="rounded-lg bg-[#14213D] px-2.5 py-1 text-base font-extrabold text-[#FCA311]">
                      {item.customerSnapshot?.total || "—"} ج.م
                    </span>
                    {item.shippingCompany === "bosta" && (item.trackingNumber || item.bostaShippingFee != null) ? (
                      <span className="text-[11px] font-extrabold text-[#14213D]">
                        {item.trackingNumber ? <span dir="ltr">{item.trackingNumber}</span> : null}
                        {item.trackingNumber && item.bostaShippingFee != null ? " · " : ""}
                        {item.bostaShippingFee != null
                          ? `شحن ${Number(item.bostaShippingFee).toLocaleString("ar-EG")} ج.م`
                          : ""}
                        {item.bostaStatus ? ` · ${getBostaStatusLabelAr(item.bostaStatus)}` : ""}
                      </span>
                    ) : null}
                    {isConfirmed ? (
                      canOpenOrders ? (
                        <Link
                          href={`/cs/orders/${item.id}`}
                          className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs font-extrabold text-white"
                        >
                          فتح
                        </Link>
                      ) : null
                    ) : (
                      <button
                        type="button"
                        onClick={() => void openOrder(item.id)}
                        className="rounded-lg bg-[#FCA311] px-3 py-1.5 text-xs font-extrabold text-black"
                      >
                        مكالمة
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {!isCourierSupervisor && hasMore ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              void loadQueue({
                query: draft.query.trim(),
                dateFrom: applied.dateFrom,
                dateTo: applied.dateTo,
                cursorId: nextCursor,
                append: true,
              }).finally(() => setLoadingMore(false));
            }}
            className="mx-auto mt-3 block h-10 rounded-xl bg-[#14213D] px-4 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {loadingMore ? "جار التحميل..." : "تحميل المزيد"}
          </button>
        ) : null}
      </div>

      <div className="print-only hidden">
        <h1 className="mb-2 text-center text-lg font-bold">
          شيت مخزن —{" "}
          {printMode === "bosta"
            ? "بوسطة"
            : printMode === "sayed_temima"
              ? printingCourierId
                ? `سيد تميمة — ${couriers.find((courier) => courier.id === printingCourierId)?.name || "المندوب"}`
                : "سيد تميمة"
              : "كل الشركات"}
        </h1>
        <p className="mb-2 text-center text-xs">
          {new Date().toLocaleString("ar-EG")} · عدد الصفوف: {printRows.length}
        </p>
        {printMode === "sayed_temima" ? (
          <>
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr>
                  {["مسلسل", "الرقم", "الاسم", "موبايل", "العنوان", "المنتجات", "رقم الفاتورة", "ديبوزت", "الإجمالي"].map(
                    (h) => (
                      <th key={h} className="border border-black px-1 py-1 text-right">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {printRows.map((item, index) => {
                  const dup = dupMeta.get(item.id);
                  const money = temimaMoney(item);
                  return (
                    <tr key={item.id} className={dup ? dup.colorClass : undefined}>
                      <td className="border border-black px-1 py-1 text-center">{index + 1}</td>
                      <td className="border border-black px-1 py-1">#{item.wooOrderNumber}</td>
                      <td className="border border-black px-1 py-1">{item.customerSnapshot?.customerName}</td>
                      <td className="border border-black px-1 py-1" dir="ltr">
                        {item.customerSnapshot?.phone}
                        {dup ? ` (×${dup.count})` : ""}
                      </td>
                      <td className="border border-black px-1 py-1">
                        {item.customerSnapshot?.addressFull || item.customerSnapshot?.address || ""}
                      </td>
                      <td className="border border-black px-1 py-1 whitespace-pre-line">{formatOrderNames(item)}</td>
                      <td className="border border-black px-1 py-1" dir="ltr">
                        {item.invoiceNumber || ""}
                      </td>
                      <td className="border border-black px-1 py-1">{money.paid ? money.paid : ""}</td>
                      <td className="border border-black px-1 py-1">{money.remainder}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="border border-black px-1 py-1 font-bold" colSpan={7}>
                    المجموع
                  </td>
                  <td className="border border-black px-1 py-1 font-bold">
                    {printRows.reduce((sum, row) => sum + temimaMoney(row).paid, 0).toLocaleString("ar-EG")}
                  </td>
                  <td className="border border-black px-1 py-1 font-bold">
                    {printRows.reduce((sum, row) => sum + temimaMoney(row).remainder, 0).toLocaleString("ar-EG")}
                  </td>
                </tr>
              </tfoot>
            </table>
            {(() => {
              const ordersTotal = printRows.reduce(
                (sum, row) => sum + parseOrderTotal(row.customerSnapshot?.total),
                0,
              );
              const shippingTotal = printRows.length * SAYED_TEMIMA_SHIPPING_EGP;
              return (
                <div className="mt-3 space-y-1 text-xs font-bold">
                  <p>
                    جمع قيمة الأوردرات: {ordersTotal.toLocaleString("ar-EG")} ج.م · عدد الأوردرات:{" "}
                    {printRows.length}
                  </p>
                  <p>
                    إجمالي الشحن ({SAYED_TEMIMA_SHIPPING_EGP} × {printRows.length}):{" "}
                    {shippingTotal.toLocaleString("ar-EG")} ج.م
                  </p>
                  <p>الإجمالي الكلي (أوردرات − شحن): {(ordersTotal - shippingTotal).toLocaleString("ar-EG")} ج.م</p>
                </div>
              );
            })()}
          </>
        ) : (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                {["الرقم", "الاسم", "موبايل", "العنوان", "رقم الفاتورة", "الإجمالي", "الشحن", "المسؤول"].map((h) => (
                  <th key={h} className="border border-black px-1 py-1 text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {printRows.map((item) => {
                const dup = dupMeta.get(item.id);
                return (
                  <tr key={item.id} className={dup ? dup.colorClass : undefined}>
                    <td className="border border-black px-1 py-1">#{item.wooOrderNumber}</td>
                    <td className="border border-black px-1 py-1">{item.customerSnapshot?.customerName}</td>
                    <td className="border border-black px-1 py-1" dir="ltr">
                      {item.customerSnapshot?.phone}
                      {dup ? ` (×${dup.count})` : ""}
                    </td>
                    <td className="border border-black px-1 py-1">
                      {item.customerSnapshot?.addressFull || item.customerSnapshot?.address || ""}
                    </td>
                    <td className="border border-black px-1 py-1" dir="ltr">
                      {item.invoiceNumber || ""}
                    </td>
                    <td className="border border-black px-1 py-1">{item.customerSnapshot?.total}</td>
                    <td className="border border-black px-1 py-1">
                      {item.shippingCompany
                        ? SHIPPING_COMPANY_LABEL[item.shippingCompany] || item.shippingCompany
                        : ""}
                    </td>
                    <td className="border border-black px-1 py-1">{item.assignedAgent?.name || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-only,
          .print-only * {
            visibility: visible !important;
          }
          .print-only {
            display: block !important;
            position: absolute;
            inset: 0;
            padding: 12mm;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
}
