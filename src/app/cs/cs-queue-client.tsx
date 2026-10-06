"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { SHIPPING_COMPANY_LABEL } from "@/lib/cs/checklist";
import { getBostaStatusLabelAr } from "@/lib/shipping/bosta-zones";
import {
  cairoClock,
  cairoTodayYmd,
  cairoYesterdayYmd,
  formatCairoOrderDate,
  formatCairoOrderDateTime,
  isWithinCairoDateRange,
  effectivePaymentState,
  sheetCollectedSplit,
  type CsPaymentState,
} from "@/lib/cs/order-window";
import { parseWooOrderNumber } from "@/lib/cs/assignments-client";
import {
  formatCutoffClock12,
  formatSayedSheetHeading,
  onUnifiedSayedSheet,
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
  settlementDisposition?: "" | "collect" | "return" | "postpone";
  sheetSerial?: number | null;
};

function lineQuantity(quantity: unknown) {
  const qty = Number(quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function formatOrderNames(item: CsQueueItem) {
  const lines = item.customerSnapshot?.items || [];
  if (!lines.length) return "—";
  return lines
    .map((line) => {
      const name = String(line.name || "").trim();
      if (!name) return "";
      const qty = lineQuantity(line.quantity);
      return qty > 0 ? `${name} × ${qty}` : name;
    })
    .filter(Boolean)
    .join("\n");
}

function sheetPieceCount(item: CsQueueItem) {
  return (item.customerSnapshot?.items || []).reduce((sum, line) => sum + lineQuantity(line.quantity), 0);
}

function sheetDepositNet(item: CsQueueItem) {
  return sheetCollectedSplit({
    total: parseOrderTotal(item.customerSnapshot?.total),
    wooStatus: item.customerSnapshot?.wooStatus,
    paymentState: itemPaymentState(item),
    depositAmount: item.depositAmount,
    depositPaid: item.depositPaid,
    depositApprovalStatus: item.depositApprovalStatus,
  });
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
  return effectivePaymentState({
    paymentMethod: snap?.paymentMethod,
    paymentMethodId: snap?.paymentMethodId,
    wooStatus: snap?.wooStatus,
    datePaid: snap?.datePaid,
    paymentState: snap?.paymentState,
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
  const closedDay =
    Boolean(f.dateFrom) && f.dateFrom === f.dateTo && cutoffs.some((row) => row.dayYmd === f.dateFrom);
  let rows = closedDay ? items.slice() : items.filter((item) => onUnifiedSayedSheet(item, f.dateFrom, f.dateTo, cutoffs, edits));
  const query = f.query.trim();
  if (query) rows = rows.filter((item) => matchesSearchQuery(item, query));
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
  const frozenDay = Boolean(f.dateFrom) && f.dateFrom === f.dateTo && rows.some((row) => row.sheetSerial && row.sheetSerial > 0);
  if (frozenDay) {
    return rows.sort((a, b) => (a.sheetSerial || 0) - (b.sheetSerial || 0));
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
    setHint("جاري التحميل");
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

function minutesToTimeValue(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeValueToMinutes(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function TemimaCutoffBox({
  cutoffs,
  busy,
  onLockNow,
  onLockMinutes,
}: {
  cutoffs: TemimaCutoff[];
  busy: boolean;
  onLockNow: () => Promise<void>;
  onLockMinutes: (minutes: number) => Promise<void>;
}) {
  const today = cutoffs.find((row) => row.dayYmd === cairoTodayYmd());
  const shown = today?.minutes ?? cairoClock(new Date().toISOString())?.minutes ?? 0;
  const picker = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = picker.current;
    if (!input || busy) return;
    const showPicker = input.showPicker?.bind(input);
    if (showPicker) {
      try {
        showPicker();
        return;
      } catch {
        input.click();
        return;
      }
    }
    input.click();
  }

  return (
    <div className="no-print rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
      <p className="text-sm font-extrabold text-[#14213D]">
        {today ? `شيت سيد مقفول النهاردة عند ${formatCutoffClock12(today.minutes)}.` : "قفل شيت سيد تميمة"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={openPicker}
          className="h-9 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-3 text-sm font-extrabold text-[#14213D] disabled:opacity-60"
        >
          {formatCutoffClock12(shown)}
        </button>
        <input
          ref={picker}
          type="time"
          tabIndex={-1}
          disabled={busy}
          value={minutesToTimeValue(shown)}
          onChange={(event) => {
            const total = timeValueToMinutes(event.target.value);
            if (total == null || busy) return;
            void onLockMinutes(total);
          }}
          className="sr-only"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void onLockNow()}
          className="h-9 rounded-lg bg-[#FCA311] px-3 text-xs font-extrabold text-black disabled:opacity-60"
        >
          {busy ? "جاري التحميل" : "الآن"}
        </button>
      </div>
    </div>
  );
}

type Props = {
  initialItems: CsQueueItem[];
  isSupervisor?: boolean;
  isAccounting?: boolean;
  isCourierSupervisor?: boolean;
  showOfficialMarks?: boolean;
  canPressOfficial?: boolean;
  canOpenOrders?: boolean;
  canSetTemimaCutoff?: boolean;
  canEditTemimaSheet?: boolean;
  canEditInvoice?: boolean;
  canPrintQueue?: boolean;
  canHandToCarrier?: boolean;
  temimaCutoffs?: TemimaCutoff[];
  temimaSheetEdits?: TemimaSheetEdit[];
  agents?: Array<{ id: number; name: string }>;
  couriers?: Array<{ id: number; name: string }>;
  initialHasMore?: boolean;
  initialTotal?: number;
};

type TemimaAddMatch = {
  id: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  status: string;
};

type PrintMode = "none" | "sheet" | "queue";

function officialActions(disposition: "" | "collect" | "return" | "postpone" | undefined) {
  if (disposition === "collect") return ["delivered"] as const;
  if (disposition === "return") return ["returned"] as const;
  if (disposition === "postpone") return ["delivered", "returned"] as const;
  return ["delivered", "returned", "postponed"] as const;
}

export function CsQueueClient({
  initialItems,
  isSupervisor,
  isAccounting,
  isCourierSupervisor,
  showOfficialMarks = false,
  canPressOfficial = false,
  canOpenOrders = true,
  canSetTemimaCutoff = false,
  canEditTemimaSheet = false,
  canEditInvoice = false,
  canPrintQueue = false,
  canHandToCarrier = false,
  temimaCutoffs = [],
  temimaSheetEdits = [],
  agents = [],
  couriers = [],
  initialHasMore = false,
  initialTotal = 0,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(isCourierSupervisor ? temimaSheetDraft : defaultDraft);
  const [applied, setApplied] = useState<DraftFilters>(isCourierSupervisor ? temimaSheetDraft : defaultDraft);
  const [afterLastDistribution, setAfterLastDistribution] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>("none");
  const [printingCourierId, setPrintingCourierId] = useState<number | null>(null);
  const [courierPrintPick, setCourierPrintPick] = useState("");
  const [cutoffs, setCutoffs] = useState<TemimaCutoff[]>(temimaCutoffs);
  const [sheetEdits, setSheetEdits] = useState<TemimaSheetEdit[]>(temimaSheetEdits);
  const [addOpen, setAddOpen] = useState(false);
  const [addOrders, setAddOrders] = useState("");
  const [addMatches, setAddMatches] = useState<TemimaAddMatch[]>([]);
  const [selectedAddIds, setSelectedAddIds] = useState<number[]>([]);
  const [addSearchState, setAddSearchState] = useState<"idle" | "loading" | "done">("idle");
  const addSearchSeq = useRef(0);
  const [sheetEditBusy, setSheetEditBusy] = useState(false);
  const [cutoffBusy, setCutoffBusy] = useState(false);
  const [savingShipId, setSavingShipId] = useState<number | null>(null);
  const [savingHandId, setSavingHandId] = useState<number | null>(null);
  const [markingId, setMarkingId] = useState<number | null>(null);

  async function lockCutoff(body: { now: true } | { minutes: number }) {
    setCutoffBusy(true);
    setMessage("");
    const hadToday = cutoffs.some((row) => row.dayYmd === cairoTodayYmd());
    const res = await fetch("/api/cs/temima-cutoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { message?: string; dayYmd?: string; minutes?: number; frozen?: boolean };
    setCutoffBusy(false);
    if (!res.ok || !data.dayYmd || data.minutes == null) {
      setMessage(data.message || "تعذر حفظ الوقت.");
      return;
    }
    if (data.frozen) {
      setMessage("الشيت متجمد من وقت القفل.");
      return;
    }
    setCutoffs((prev) => {
      const next = prev.filter((row) => row.dayYmd !== data.dayYmd);
      next.push({ dayYmd: data.dayYmd as string, minutes: data.minutes as number });
      return next;
    });
    const clock = formatCutoffClock12(data.minutes);
    setMessage(hadToday ? `اتعدل وقت قفل الشيت إلى ${clock}.` : `شيت سيد اتقفل النهاردة عند ${clock}.`);
  }

  const syncingRef = useRef(false);
  const searchWasActive = useRef(false);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;
  const draftQueryRef = useRef(draft.query);
  draftQueryRef.current = draft.query;
  const pageRef = useRef(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [queuePage, setQueuePage] = useState(1);
  const [queueTotal, setQueueTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheetPrintRows, setSheetPrintRows] = useState<CsQueueItem[] | null>(null);

  useEffect(() => {
    setItems(initialItems);
    setHasMore(initialHasMore);
    setQueuePage(1);
    setQueueTotal(initialTotal);
    pageRef.current = 1;
  }, [initialItems, initialHasMore, initialTotal]);

  async function loadQueue(filters: DraftFilters, page: number) {
    const params = new URLSearchParams();
    const query = filters.query.trim();
    const pageNo = Math.max(1, page);
    if (query) params.set("q", query);
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
    if (filters.dateBasis === "saved") params.set("basis", "saved");
    const status = normalizeFilterStatus(filters.status);
    if (status && status !== "all") params.set("status", status);
    if (filters.shipping && filters.shipping !== "all") params.set("shipping", filters.shipping);
    if (filters.agentId && filters.agentId !== "all") params.set("agent", filters.agentId);
    if (filters.payment && filters.payment !== "all") params.set("payment", filters.payment);
    if (filters.followUp && filters.followUp !== "all") params.set("follow", filters.followUp);
    if (filters.trackingFilter === "missing") params.set("tracking", "missing");
    if (filters.waybillFilter === "not_printed") params.set("waybill", "not_printed");
    params.set("page", String(pageNo));
    const res = await fetch(`/api/cs/orders?${params.toString()}`);
    const data = (await res.json()) as {
      message?: string;
      items?: CsQueueItem[];
      hasMore?: boolean;
      total?: number;
    };
    if (!res.ok) {
      setMessage(data.message || "تعذر تحميل الأوردرات.");
      return;
    }
    setItems(data.items || []);
    setHasMore(Boolean(data.hasMore));
    setQueueTotal(Number(data.total ?? 0));
    setQueuePage(pageNo);
    pageRef.current = pageNo;
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
        if (!opts?.quiet || (data.imported ?? 0) > 0) await loadSayedSheet(appliedRef.current);
        return;
      }
      const query = draftQueryRef.current.trim();
      if (!query && pageRef.current === 1) {
        await loadQueue({ ...appliedRef.current, query: "" }, 1);
      }
      if (opts?.quiet && (data.imported ?? 0) > 0) {
        setMessage(`مزامنة تلقائية: طلبات جديدة ${data.imported}`);
      }
    } finally {
      syncingRef.current = false;
      if (!opts?.quiet) setLoading(false);
    }
  }

  // Auto-sync every 3 minutes so open desks stay under the database connection cap.
  useEffect(() => {
    const id = window.setInterval(() => {
      void syncOrders({ quiet: true });
    }, 180000);
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
        void loadQueue({ ...appliedRef.current, query: "" }, 1);
        return;
      }
      searchWasActive.current = true;
      void loadQueue({ ...appliedRef.current, query }, 1);
    }, 400);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.query, isCourierSupervisor]);

  // Search is live and independent of other filters: when query is set, match all loaded items.
  const baseFiltered = useMemo(() => {
    if (isCourierSupervisor) {
      return applyCourierSupervisorSheet(items, { ...applied, query: draft.query }, afterLastDistribution, cutoffs, sheetEdits);
    }
    return [...items].sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
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
    if (sheetPrintRows) return sheetPrintRows;
    if (printingCourierId) return filtered.filter((item) => item.courierAgentId === printingCourierId);
    return filtered;
  }, [filtered, printingCourierId, sheetPrintRows]);

  useEffect(() => {
    if (printMode === "none") return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrinting(false);
      setPrintMode("none");
      setPrintingCourierId(null);
      setSheetPrintRows(null);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [printMode]);

  function openOrder(id: number) {
    router.push(`/cs/orders/${id}`);
  }

  async function markSupervisorResult(id: number, result: "delivered" | "returned" | "postponed") {
    if (markingId) return;
    setMarkingId(id);
    setMessage("");
    const res = await fetch("/api/cs/courier-dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "result", confirmationId: id, outcome: result }),
    });
    const data = (await res.json()) as { message?: string };
    setMarkingId(null);
    if (!res.ok) {
      setMessage(data.message || "تعذر تسجيل حالة الأوردر.");
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const settlementDisposition = result === "delivered" ? "collect" : result === "returned" ? "return" : "postpone";
        return { ...item, settlementDisposition };
      }),
    );
  }

  async function setShipping(id: number, shippingCompany: "bosta" | "sayed_temima") {
    if (savingShipId) return;
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

  async function setHanded(id: number, handedToCarrier: boolean) {
    if (savingHandId) return;
    setSavingHandId(id);
    setMessage("");
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, handedToCarrier } : item)));
    const res = await fetch(`/api/cs/confirmations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handedToCarrier }),
    });
    const data = (await res.json()) as {
      message?: string;
      handedToCarrier?: boolean;
      handedToCarrierAt?: string | null;
    };
    setSavingHandId(null);
    if (!res.ok) {
      setMessage(data.message || "تعذر تسجيل التسليم لشركة الشحن.");
      router.refresh();
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              handedToCarrier: Boolean(data.handedToCarrier),
              handedToCarrierAt: data.handedToCarrierAt ?? item.handedToCarrierAt,
            }
          : item,
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
    setFiltering(true);
    const work = isCourierSupervisor ? loadSayedSheet(filters) : loadQueue(filters, 1);
    void Promise.resolve(work).finally(() => setFiltering(false));
  }

  async function loadSayedSheet(filters: DraftFilters) {
    const params = new URLSearchParams({
      sheet: "temima",
      from: filters.dateFrom,
      to: filters.dateTo,
    });
    const res = await fetch(`/api/cs/orders?${params.toString()}`);
    const data = (await res.json()) as { message?: string; items?: CsQueueItem[] };
    if (!res.ok) {
      setMessage(data.message || "تعذر تحميل شيت سيد.");
      return;
    }
    setItems(data.items || []);
  }

  async function printApplied() {
    if (printing) return;
    setPrinting(true);
    const filters = { ...applied, query: draft.query };
    if (isCourierSupervisor || temimaDateMode(filters)) {
      const params = new URLSearchParams({ sheet: "temima", from: filters.dateFrom, to: filters.dateTo });
      const res = await fetch(`/api/cs/orders?${params.toString()}`);
      const data = (await res.json()) as { message?: string; items?: CsQueueItem[] };
      if (!res.ok) {
        setPrinting(false);
        setMessage(data.message || "تعذر تجهيز الطباعة.");
        return;
      }
      const printed = [...(data.items || [])];
      if (filters.dateFrom && filters.dateFrom === filters.dateTo && printed.some((item) => item.sheetSerial && item.sheetSerial > 0)) {
        printed.sort((a, b) => (a.sheetSerial || 0) - (b.sheetSerial || 0));
      } else if (filters.dateFrom && filters.dateFrom === filters.dateTo) {
        printed.sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
      }
      setSheetPrintRows(printed);
      setPrintMode("sheet");
      return;
    }
    const params = new URLSearchParams();
    const query = filters.query.trim();
    if (query) params.set("q", query);
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
    if (filters.dateBasis === "saved") params.set("basis", "saved");
    const status = normalizeFilterStatus(filters.status);
    if (status && status !== "all") params.set("status", status);
    if (filters.shipping && filters.shipping !== "all") params.set("shipping", filters.shipping);
    if (filters.agentId && filters.agentId !== "all") params.set("agent", filters.agentId);
    if (filters.payment && filters.payment !== "all") params.set("payment", filters.payment);
    if (filters.followUp && filters.followUp !== "all") params.set("follow", filters.followUp);
    if (filters.trackingFilter === "missing") params.set("tracking", "missing");
    if (filters.waybillFilter === "not_printed") params.set("waybill", "not_printed");
    params.set("all", "1");
    const res = await fetch(`/api/cs/orders?${params.toString()}`);
    const data = (await res.json()) as { message?: string; items?: CsQueueItem[] };
    if (!res.ok) {
      setPrinting(false);
      setMessage(data.message || "تعذر تجهيز الطباعة.");
      return;
    }
    let rows = data.items || [];
    if (draft.duplicates === "only") {
      const meta = buildDuplicateMeta(rows);
      rows = rows.filter((item) => meta.has(item.id));
    }
    setSheetPrintRows(rows);
    setPrintMode("queue");
  }

  const sheetDay = applied.dateFrom && applied.dateFrom === applied.dateTo ? applied.dateFrom : "";
  const liveSheetSerial = useMemo(() => {
    const ordered = [...items].sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
    const map = new Map<number, number>();
    ordered.forEach((item, index) => {
      if (!(item.sheetSerial && item.sheetSerial > 0)) map.set(item.id, index + 1);
    });
    return map;
  }, [items]);
  const sheetDayTotal = isCourierSupervisor
    ? filtered.reduce((sum, item) => sum + parseOrderTotal(item.customerSnapshot?.total), 0)
    : 0;

  function rememberEdits(next: TemimaSheetEdit[]) {
    setSheetEdits((prev) => {
      const kept = prev.filter(
        (row) => !next.some((item) => item.dayYmd === row.dayYmd && item.confirmationId === row.confirmationId),
      );
      return [...kept, ...next];
    });
  }

  useEffect(() => {
    if (!canEditTemimaSheet || !addOpen) return;
    const query = addOrders.trim();
    if (query.length < 2) {
      setAddMatches([]);
      setSelectedAddIds([]);
      setAddSearchState("idle");
      return;
    }
    setAddSearchState("loading");
    const seq = addSearchSeq.current + 1;
    addSearchSeq.current = seq;
    const handle = window.setTimeout(() => {
      void (async () => {
        const res = await fetch("/api/cs/temima-sheet-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search", query }),
        });
        const data = (await res.json()) as { message?: string; matches?: TemimaAddMatch[] };
        if (seq !== addSearchSeq.current) return;
        if (!res.ok) {
          setAddMatches([]);
          setAddSearchState("done");
          setMessage(data.message || "تعذر البحث في الأوردرات.");
          return;
        }
        const matches = data.matches || [];
        setAddMatches(matches);
        setSelectedAddIds((prev) => prev.filter((id) => matches.some((item) => item.id === id)));
        setAddSearchState("done");
      })();
    }, 350);
    return () => window.clearTimeout(handle);
  }, [addOrders, addOpen, canEditTemimaSheet]);

  async function addSheetOrders() {
    if (!sheetDay || sheetEditBusy || !selectedAddIds.length) return;
    setSheetEditBusy(true);
    setMessage("");
    const res = await fetch("/api/cs/temima-sheet-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "include", dayYmd: sheetDay, confirmationIds: selectedAddIds }),
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
    setAddMatches([]);
    setSelectedAddIds([]);
    setAddSearchState("idle");
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
    setItems((prev) => prev.filter((item) => item.id !== confirmationId));
  }

  async function saveSheetSerial(confirmationId: number, serial: number) {
    if (!sheetDay || sheetEditBusy || !canEditTemimaSheet) return;
    setSheetEditBusy(true);
    setMessage("");
    const res = await fetch("/api/cs/temima-sheet-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "serial", dayYmd: sheetDay, confirmationId, serial }),
    });
    const data = (await res.json()) as { message?: string };
    setSheetEditBusy(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر حفظ المسلسل.");
      return;
    }
    setItems((prev) => prev.map((item) => (item.id === confirmationId ? { ...item, sheetSerial: serial } : item)));
    setMessage("اتحفظ المسلسل.");
  }

  async function freezeSheetDay() {
    if (!sheetDay || sheetEditBusy) return;
    setSheetEditBusy(true);
    setMessage("");
    const res = await fetch("/api/cs/temima-sheet-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "freeze", dayYmd: sheetDay }),
    });
    const data = (await res.json()) as { message?: string; frozen?: boolean };
    setSheetEditBusy(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر تجميد اليوم.");
      return;
    }
    await loadSayedSheet(applied);
    setMessage(data.message || "اتقفل وتجمد.");
  }

  function resetFilters() {
    const next = isCourierSupervisor ? temimaSheetDraft() : defaultDraft();
    setDraft(next);
    setApplied(next);
    setAfterLastDistribution(false);
    setMessage("");
    setFiltering(true);
    const work = isCourierSupervisor ? loadSayedSheet(next) : loadQueue(next, 1);
    void Promise.resolve(work).finally(() => setFiltering(false));
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="no-print flex flex-col gap-3 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/15 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-4">
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-xl font-extrabold text-[#14213D] sm:text-2xl">
            {isCourierSupervisor
              ? sheetDay
                ? formatSayedSheetHeading(sheetDay)
                : "شيت سيد تميمة"
              : "قائمة تأكيد الطلبات"}
          </h1>
          <div className="mt-1 flex items-center justify-between gap-3 text-sm font-bold text-[#14213D]/70">
            <p>
              عدد النتائج: <span className="rounded bg-[#14213D] px-2 py-0.5 text-[#FCA311]">{isCourierSupervisor ? filtered.length : items.length}</span>
              {!isCourierSupervisor ? <> من أصل {queueTotal}</> : null}
            </p>
            {isCourierSupervisor ? (
              <p className="shrink-0 text-[#14213D]">
                {sheetDay ? "قيمة اليوم" : "إجمالي القيمة"}:{" "}
                <span className="rounded bg-[#14213D] px-2 py-0.5 text-[#FCA311]">
                  {sheetDayTotal.toLocaleString("ar-EG")} ج.م
                </span>
              </p>
            ) : null}
          </div>
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
          {canPrintQueue ? (
          <button
            type="button"
            disabled={printing}
            onClick={() => {
              setPrintingCourierId(null);
              void printApplied();
            }}
            className="shrink-0 rounded-xl bg-black px-3 py-2 text-xs font-extrabold text-white disabled:opacity-60 sm:py-2.5 sm:text-sm"
          >
            {printing ? "جاري التحميل" : "طباعة"}
          </button>
          ) : null}
          {isCourierSupervisor ? (
            <Link
              href="/cs/temima-scan"
              className="shrink-0 rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white sm:py-2.5 sm:text-sm"
            >
              استلام بالسكان
            </Link>
          ) : null}
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
                disabled={printing || !courierPrintPick}
                onClick={() => {
                  if (printing) return;
                  setPrinting(true);
                  setSheetPrintRows(null);
                  setPrintingCourierId(Number(courierPrintPick));
                  setPrintMode("sheet");
                }}
                className="rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50 sm:py-2.5 sm:text-sm"
              >
                {printing ? "جاري التحميل" : "طباعة المندوب"}
              </button>
            </div>
          ) : null}
          <button
            type="button"
            disabled={loading}
            onClick={() => void syncOrders()}
            className="shrink-0 rounded-xl bg-[#FCA311] px-3 py-2 text-xs font-extrabold text-black disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
          >
            {loading ? "جاري التحميل" : "مزامنة"}
          </button>
        </div>
      </div>

      {canSetTemimaCutoff ? (
        <TemimaCutoffBox
          cutoffs={cutoffs}
          busy={cutoffBusy}
          onLockNow={() => lockCutoff({ now: true })}
          onLockMinutes={(minutes) => lockCutoff({ minutes })}
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
            onChange={(e) =>
              patchDraft({
                status: e.target.value,
                followUp: "all",
                dateBasis:
                  e.target.value === "CONFIRMED" && draft.shipping === "sayed_temima" ? "saved" : draft.dateBasis,
              })
            }
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
            onChange={(e) =>
              patchDraft({
                shipping: e.target.value,
                dateBasis:
                  e.target.value === "sayed_temima" && normalizeFilterStatus(draft.status) === "CONFIRMED"
                    ? "saved"
                    : draft.dateBasis,
              })
            }
            className={FILTER_CONTROL}
          >
            <option value="all">كل شركات الشحن</option>
            <option value="bosta">بوسطة</option>
            <option value="sayed_temima">سيد تميمة</option>
          </select>
          )}
          {isCourierSupervisor || !temimaDateMode(draft) ? null : (
            <p className={`${FILTER_CONTROL} flex items-center text-[11px] font-extrabold`}>تاريخ الحفظ</p>
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
              disabled={filtering}
              onClick={runFilter}
              className="h-9 flex-1 rounded-lg bg-[#FCA311] px-3 text-xs font-extrabold text-black disabled:opacity-60"
            >
              {filtering ? "جاري التحميل" : "فلتر"}
            </button>
            <button
              type="button"
              disabled={filtering}
              onClick={resetFilters}
              className="h-9 rounded-lg bg-[#E5E5E5] px-3 text-xs font-bold text-[#14213D] disabled:opacity-60"
            >
              {filtering ? "جاري التحميل" : "إعادة"}
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

      {canEditTemimaSheet && sheetDay ? (
        <form
          className="no-print grid gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10"
          onSubmit={(event) => {
            event.preventDefault();
            void addSheetOrders();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAddOpen((open) => !open)}
              className="h-9 w-9 rounded-xl bg-[#14213D] text-lg font-extrabold text-white"
            >
              +
            </button>
            <button
              type="button"
              disabled={sheetEditBusy}
              onClick={() => void freezeSheetDay()}
              className="h-9 rounded-xl bg-[#FCA311] px-3 text-xs font-extrabold text-black disabled:opacity-60"
            >
              {sheetEditBusy ? "جاري التحميل" : "قفل وتجميد"}
            </button>
          </div>
          {addOpen ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <input
                  value={addOrders}
                  onChange={(event) => setAddOrders(event.target.value)}
                  placeholder="رقم الأوردر أو الموبايل أو اسم العميل"
                  className="h-10 min-w-[12rem] flex-1 rounded-xl border border-[#E5E5E5] bg-[#F5F5F0] px-3 text-sm font-bold"
                />
                <button
                  type="submit"
                  disabled={sheetEditBusy || !selectedAddIds.length}
                  className="h-10 rounded-xl bg-[#FCA311] px-3 text-sm font-extrabold text-black disabled:opacity-60"
                >
                  {sheetEditBusy ? "جاري التحميل" : "إضافة"}
                </button>
              </div>
              {addSearchState === "loading" ? (
                <p className="text-xs font-bold text-[#14213D]/60">جار البحث في الأوردرات...</p>
              ) : null}
              {addSearchState === "done" && !addMatches.length ? (
                <p className="text-xs font-bold text-red-700">مش موجود في الأوردرات.</p>
              ) : null}
              {addMatches.length ? (
                <div className="grid max-h-56 gap-1 overflow-auto">
                  {addMatches.map((match) => {
                    const selected = selectedAddIds.includes(match.id);
                    const label = statusMeta[match.status]?.label || match.status;
                    return (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() =>
                          setSelectedAddIds((prev) =>
                            prev.includes(match.id) ? prev.filter((id) => id !== match.id) : [...prev, match.id],
                          )
                        }
                        className={`rounded-xl px-3 py-2 text-right text-sm font-bold ${
                          selected ? "bg-[#FCA311] text-black" : "bg-[#F5F5F0] text-[#14213D]"
                        }`}
                      >
                        #{match.wooOrderNumber} · {match.customerName || "بدون اسم"} · {match.phone || "بدون موبايل"} · {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : null}

      {!isCourierSupervisor ? (
        <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 shadow ring-1 ring-[#14213D]/10">
          <p className="text-sm font-extrabold text-[#14213D]">
            الصفحة {queuePage} · {items.length} من أصل {queueTotal}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loadingMore || queuePage <= 1}
              onClick={() => {
                setLoadingMore(true);
                void loadQueue({ ...applied, query: draft.query }, queuePage - 1).finally(() => setLoadingMore(false));
              }}
              className="h-10 rounded-xl bg-[#E5E5E5] px-4 text-sm font-extrabold text-[#14213D] disabled:opacity-50"
            >
              {loadingMore ? "جاري التحميل" : "السابق"}
            </button>
            <button
              type="button"
              disabled={loadingMore || !hasMore}
              onClick={() => {
                setLoadingMore(true);
                void loadQueue({ ...applied, query: draft.query }, queuePage + 1).finally(() => setLoadingMore(false));
              }}
              className="h-10 rounded-xl bg-[#14213D] px-4 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {loadingMore ? "جاري التحميل" : "التالي"}
            </button>
          </div>
        </div>
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
            const returnedPostponed =
              isCourierSupervisor && !item.courierAgentId && item.courierOutcome === "postponed";

            return (
              <div
                key={item.id}
                className={`rounded-xl px-3 py-2.5 shadow-sm ring-1 ${
                  returnedPostponed ? "bg-orange-100 ring-orange-500" : dup ? dup.colorClass : "bg-white"
                } ${
                  returnedPostponed
                    ? ""
                    : isConfirmed
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
                      ? canHandToCarrier
                        ? "grid-cols-2 sm:grid-cols-8"
                        : "grid-cols-2 sm:grid-cols-7"
                      : isSupervisor || isAccounting
                        ? canHandToCarrier
                          ? "grid-cols-2 sm:grid-cols-7"
                          : "grid-cols-2 sm:grid-cols-6"
                        : canEditInvoice
                          ? "grid-cols-2 sm:grid-cols-5"
                          : "grid-cols-2 sm:grid-cols-4"
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] ${meta.className}`}>{meta.label}</span>
                    {returnedPostponed ? (
                      <span className="text-xs font-extrabold text-orange-800">مؤجل</span>
                    ) : null}
                    <span className="flex items-center gap-2 text-base font-extrabold">
                      #{item.wooOrderNumber}
                      {isCourierSupervisor ? (
                        canEditTemimaSheet && sheetDay && item.sheetSerial ? (
                          <input
                            key={`${item.id}-${item.sheetSerial}`}
                            type="number"
                            min={1}
                            defaultValue={item.sheetSerial}
                            aria-label="مسلسل الشيت"
                            onBlur={(event) => {
                              const next = Number(event.target.value);
                              if (!Number.isInteger(next) || next <= 0 || next === item.sheetSerial) return;
                              void saveSheetSerial(item.id, next);
                            }}
                            disabled={sheetEditBusy}
                            className="h-7 w-14 rounded border border-[#E5E5E5] bg-[#F5F5F0] px-1 text-center text-xs font-extrabold"
                          />
                        ) : (
                          <span className="rounded bg-[#14213D] px-1.5 py-0.5 text-[11px] font-extrabold text-white">
                            مسلسل {item.sheetSerial && item.sheetSerial > 0 ? item.sheetSerial : liveSheetSerial.get(item.id) || ""}
                          </span>
                        )
                      ) : null}
                      {canEditTemimaSheet && sheetDay ? (
                        <button
                          type="button"
                          disabled={sheetEditBusy}
                          onClick={() => void removeSheetOrder(item.id)}
                          className="rounded bg-red-700 px-1.5 py-0.5 text-[11px] font-extrabold text-white disabled:opacity-60"
                        >
                          {sheetEditBusy ? "جاري التحميل" : "x"}
                        </button>
                      ) : null}
                    </span>
                    <span className="text-xs text-[#14213D]/55">{day}</span>
                    {showOfficialMarks && item.shippingCompany === "sayed_temima" && item.status === "CONFIRMED" ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {officialActions(item.settlementDisposition).map((action) =>
                          action === "delivered" ? (
                            <button
                              key={action}
                              type="button"
                              disabled={!canPressOfficial || markingId === item.id}
                              onClick={() => void markSupervisorResult(item.id, "delivered")}
                              className={`rounded-lg px-2 py-1 text-[11px] font-extrabold text-white disabled:opacity-60 ${item.settlementDisposition === "collect" ? "bg-emerald-800 ring-2 ring-emerald-300" : "bg-emerald-700"}`}
                            >
                              تم بنجاح
                            </button>
                          ) : action === "returned" ? (
                            <button
                              key={action}
                              type="button"
                              disabled={!canPressOfficial || markingId === item.id}
                              onClick={() => void markSupervisorResult(item.id, "returned")}
                              className={`rounded-lg px-2 py-1 text-[11px] font-extrabold text-white disabled:opacity-60 ${item.settlementDisposition === "return" ? "bg-red-800 ring-2 ring-red-300" : "bg-red-700"}`}
                            >
                              الغاء
                            </button>
                          ) : (
                            <button
                              key={action}
                              type="button"
                              disabled={!canPressOfficial || markingId === item.id}
                              onClick={() => void markSupervisorResult(item.id, "postponed")}
                              className={`rounded-lg px-2 py-1 text-[11px] font-extrabold disabled:opacity-60 ${item.settlementDisposition === "postpone" ? "bg-orange-600 text-black ring-2 ring-orange-300" : "bg-orange-500 text-black"}`}
                            >
                              مؤجل
                            </button>
                          ),
                        )}
                      </div>
                    ) : null}
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
                    {item.depositPaid && item.depositAmount != null && item.depositAmount > 0 ? (
                      <span className="w-fit rounded bg-[#14213D]/10 px-1.5 py-0.5 text-[10px] font-extrabold text-[#14213D]">
                        ديبوزت {Number(item.depositAmount).toLocaleString("ar-EG")} · الباقي على شركة الشحن{" "}
                        {Math.max(0, parseOrderTotal(item.customerSnapshot?.total) - Number(item.depositAmount)).toLocaleString("ar-EG")}
                      </span>
                    ) : item.depositAmount != null && item.depositAmount > 0 ? (
                      <span className="w-fit rounded bg-[#14213D]/10 px-1.5 py-0.5 text-[10px] text-[#14213D]" dir="ltr">
                        مقدم: {item.depositAmount}
                      </span>
                    ) : null}
                    {isCourierSupervisor ? (
                      <span className="w-fit rounded bg-[#FCA311]/30 px-1.5 py-0.5 text-[10px] font-extrabold text-[#14213D]">
                        تم تحصيل {temimaMoney(item).paid.toLocaleString("ar-EG")} · باقي {temimaMoney(item).remainder.toLocaleString("ar-EG")}
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
                      {savingShipId === item.id ? (
                        <span className="text-[10px] font-extrabold text-[#14213D]">جاري التحميل</span>
                      ) : null}
                    </div>
                  ) : null}
                  {isSupervisor || isAccounting ? (
                    <div className="flex w-1/2 min-w-0 items-center justify-center self-center justify-self-center rounded-lg bg-[#F5F5F0] px-2 py-1 text-center">
                      <span className="truncate text-sm font-extrabold leading-tight text-[#14213D]">
                        {item.assignedAgent?.name || "—"}
                      </span>
                    </div>
                  ) : null}
                  {canHandToCarrier ? (
                    <label className="flex items-center justify-center gap-1 self-center text-[10px] font-bold text-[#14213D]">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[#FCA311]"
                        checked={Boolean(item.handedToCarrier)}
                        disabled={item.status !== "CONFIRMED" || savingHandId === item.id}
                        onChange={() => void setHanded(item.id, !item.handedToCarrier)}
                      />
                      تسليم للشحن
                    </label>
                  ) : null}
                  {isAccounting || canEditInvoice ? (
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
      </div>

      <div className="print-only hidden" dir="rtl">
        <h1 className="mb-2 text-center text-lg font-bold">
          {printMode === "sheet" || applied.shipping === "sayed_temima"
            ? `${
                applied.dateFrom === applied.dateTo
                  ? formatSayedSheetHeading(applied.dateFrom)
                  : `شيت مخزن سيد تميمة — ${applied.dateFrom} → ${applied.dateTo}`
              }${
                printingCourierId
                  ? ` — ${couriers.find((courier) => courier.id === printingCourierId)?.name || "المندوب"}`
                  : ""
              }`
            : "قائمة الطلبات"}
        </h1>
        <p className="mb-2 text-center text-xs">
          {new Date().toLocaleString("ar-EG")} · عدد الصفوف: {printRows.length}
        </p>
        {printMode === "sheet" || applied.shipping === "sayed_temima" ? (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                {["مسلسل", "الرقم", "الاسم", "الموبايل", "العنوان", "المنتجات", "عدد القطع", "رقم الفاتورة", "ديبوزت", "الصافي"].map(
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
                const money = sheetDepositNet(item);
                return (
                  <tr key={item.id} className={dup ? dup.colorClass : undefined}>
                    <td className="border border-black px-1 py-1 text-center">{item.sheetSerial && item.sheetSerial > 0 ? item.sheetSerial : index + 1}</td>
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
                    <td className="border border-black px-1 py-1 text-center">{sheetPieceCount(item)}</td>
                    <td className="border border-black px-1 py-1" dir="ltr">
                      {item.invoiceNumber || ""}
                    </td>
                    <td className="border border-black px-1 py-1">{money.deposit ? money.deposit : ""}</td>
                    <td className="border border-black px-1 py-1">{money.net}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="border border-black px-1 py-1 font-bold" colSpan={8}>
                  المجموع
                </td>
                <td className="border border-black px-1 py-1 font-bold">
                  {printRows.reduce((sum, row) => sum + sheetDepositNet(row).deposit, 0).toLocaleString("ar-EG")}
                </td>
                <td className="border border-black px-1 py-1 font-bold">
                  {printRows.reduce((sum, row) => sum + sheetDepositNet(row).net, 0).toLocaleString("ar-EG")}
                </td>
              </tr>
            </tfoot>
          </table>
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
