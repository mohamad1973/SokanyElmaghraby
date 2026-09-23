"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { SHIPPING_COMPANY_LABEL } from "@/lib/cs/checklist";
import { listCsGovernorates, mergeAreaOptions } from "@/lib/cs/egypt-areas";
import {
  cairoDaysAgoYmd,
  cairoTodayYmd,
  cairoYesterdayYmd,
  formatCairoOrderDate,
  isWithinCairoDateRange,
  resolvePaymentState,
  type CsPaymentState,
} from "@/lib/cs/order-window";
import { parseWooOrderNumber } from "@/lib/cs/assignments-client";
import { extractModelFromTitle, extractSkFromTitle } from "@/lib/product-display-code";

export type CsQueueItem = {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  status: string;
  shippingCompany?: string | null;
  trackingNumber?: string | null;
  waybillPrinted?: boolean;
  handedToCarrier?: boolean;
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
  createdAt: string;
};

const SAYED_TEMIMA_SHIPPING_EGP = 75;

/** Strip SK- prefix so "SK-10095" → "10095". */
function stripSkPrefix(code: string) {
  return code.replace(/^SK-?/i, "").trim().toUpperCase();
}

function modelNumberFromLine(name: string, sku?: string) {
  const fromNameSk = extractSkFromTitle(name);
  if (fromNameSk) return stripSkPrefix(fromNameSk);

  const fromModelPhrase = extractModelFromTitle(name);
  if (fromModelPhrase) {
    const nestedSk = extractSkFromTitle(fromModelPhrase) || fromModelPhrase.match(/\bSK-?\d+[A-Z0-9]*\b/i)?.[0];
    if (nestedSk) return stripSkPrefix(nestedSk);
    return stripSkPrefix(fromModelPhrase) || fromModelPhrase.trim();
  }

  const fromSku = extractSkFromTitle(String(sku || "")) || String(sku || "").match(/\bSK-?\d+[A-Z0-9]*\b/i)?.[0];
  if (fromSku) return stripSkPrefix(fromSku);

  return "";
}

function formatOrderModels(item: CsQueueItem) {
  const lines = item.customerSnapshot?.items || [];
  if (!lines.length) return "—";
  const parts = lines
    .map((line) => {
      const model = modelNumberFromLine(String(line.name || ""), line.sku);
      if (!model) return "";
      const qty = typeof line.quantity === "number" && line.quantity > 1 ? `×${line.quantity}` : "";
      return qty ? `${model}${qty}` : model;
    })
    .filter(Boolean);
  return parts.length ? parts.join("، ") : "—";
}

function parseOrderTotal(value: string | null | undefined) {
  const n = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const DATE_FILTER_MAX_DAYS = 30;
const dateMinYmd = () => cairoDaysAgoYmd(DATE_FILTER_MAX_DAYS);
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
  const min = dateMinYmd();
  const max = dateMaxYmd();
  let dateFrom = f.dateFrom || min;
  let dateTo = f.dateTo || max;
  let warning = "";

  if (dateFrom < min) {
    dateFrom = min;
    warning = "أقصى مدى للفلتر 30 يوماً من اليوم.";
  }
  if (dateTo > max) {
    dateTo = max;
    warning = "أقصى مدى للفلتر 30 يوماً من اليوم.";
  }
  if (dateFrom > dateTo) {
    dateFrom = dateTo;
    warning = "تم ضبط تاريخ البداية ليطابق النهاية.";
  }
  // Span must not exceed 30 calendar days from earliest allowed
  if (dateFrom < min) {
    dateFrom = min;
    warning = "أقصى مدى للفلتر 30 يوماً من اليوم.";
  }

  return { filters: { ...f, dateFrom, dateTo }, warning };
}

const statusMeta: Record<string, { label: string; className: string }> = {
  PENDING: { label: "بانتظار", className: "bg-[#E5E5E5] text-[#14213D]" },
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
  governorate: string;
  area: string;
  dateFrom: string;
  dateTo: string;
  duplicates: "all" | "only";
  trackingFilter: "all" | "missing";
  waybillFilter: "all" | "not_printed";
};

type DupMeta = { key: string; count: number; colorClass: string };

function defaultDraft(): DraftFilters {
  return {
    query: "",
    status: "all",
    followUp: "all",
    payment: "all",
    shipping: "all",
    agentId: "all",
    governorate: "",
    area: "",
    dateFrom: cairoYesterdayYmd(),
    dateTo: cairoTodayYmd(),
    duplicates: "all",
    trackingFilter: "all",
    waybillFilter: "all",
  };
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

function locMatch(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  const h = norm(haystack);
  const n = norm(needle);
  if (!h || !n) return false;
  return h === n || h.includes(n) || n.includes(h);
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

function applyFilters(items: CsQueueItem[], f: DraftFilters) {
  return items
    .filter((item) => {
      if (f.status === "cancelled_or_no_answer") {
        if (item.status !== "CANCELLED" && item.status !== "FAILED_CONTACT") return false;
      } else if (f.status !== "all" && item.status !== f.status) {
        return false;
      }
      if (f.status === "CONFIRMED" && f.followUp !== "all") {
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
      if (f.governorate && !locMatch(item.customerSnapshot?.governorate || item.customerSnapshot?.addressFull, f.governorate)) {
        return false;
      }
      if (f.area && !locMatch(item.customerSnapshot?.area || item.customerSnapshot?.addressFull, f.area)) {
        return false;
      }
      if (f.dateFrom && f.dateTo) {
        if (!isWithinCairoDateRange(item.customerSnapshot?.dateCreated, f.dateFrom, f.dateTo)) return false;
      }
      if (f.trackingFilter === "missing" && itemTrackingNumber(item)) return false;
      if (f.waybillFilter === "not_printed" && item.waybillPrinted) return false;
      return true;
    })
    .sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
}

type Props = {
  initialItems: CsQueueItem[];
  isSupervisor?: boolean;
  agents?: Array<{ id: number; name: string }>;
};

type PrintMode = "none" | "bosta" | "sayed_temima" | "all";

export function CsQueueClient({ initialItems, isSupervisor, agents = [] }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(defaultDraft);
  const [applied, setApplied] = useState<DraftFilters>(defaultDraft);
  const [printMode, setPrintMode] = useState<PrintMode>("none");
  const [savingShipId, setSavingShipId] = useState<number | null>(null);

  const syncingRef = useRef(false);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function syncOrders(opts?: { quiet?: boolean }) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (!opts?.quiet) {
      setLoading(true);
      setMessage("");
    }
    try {
      const res = await fetch("/api/cs/sync", { method: "POST" });
      const data = (await res.json()) as {
        message?: string;
        imported?: number;
        items?: CsQueueItem[];
      };
      if (!res.ok) {
        if (!opts?.quiet) setMessage(data.message || "تعذر المزامنة.");
        return;
      }
      if (data.items) setItems(data.items);
      if (!opts?.quiet) {
        setMessage(`تمت المزامنة. طلبات جديدة: ${data.imported ?? 0}`);
        router.refresh();
      } else if ((data.imported ?? 0) > 0) {
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

  const governorates = useMemo(() => {
    const fromOrders = items.map((i) => i.customerSnapshot?.governorate || "").filter(Boolean);
    return [...new Set([...listCsGovernorates(), ...fromOrders])].sort((a, b) => a.localeCompare(b, "ar"));
  }, [items]);

  const areaOptions = useMemo(() => {
    const gov = draft.governorate;
    if (!gov) return [] as string[];
    const fromOrders = items
      .filter((i) => locMatch(i.customerSnapshot?.governorate, gov))
      .map((i) => i.customerSnapshot?.area || "")
      .filter(Boolean);
    return mergeAreaOptions(gov, fromOrders);
  }, [draft.governorate, items]);

  // Search is live and independent of other filters: when query is set, match all loaded items.
  const baseFiltered = useMemo(() => {
    const q = draft.query.trim();
    if (q) {
      return items
        .filter((item) => matchesSearchQuery(item, q))
        .sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
    }
    return applyFilters(items, applied);
  }, [items, draft.query, applied]);

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
    if (printMode === "bosta") return filtered.filter((i) => i.shippingCompany === "bosta");
    if (printMode === "sayed_temima") return filtered.filter((i) => i.shippingCompany === "sayed_temima");
    return filtered;
  }, [filtered, printMode]);

  useEffect(() => {
    if (printMode === "none") return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintMode("none");
    }, 50);
    return () => window.clearTimeout(timer);
  }, [printMode]);

  async function openOrder(id: number) {
    const res = await fetch(`/api/cs/confirmations/${id}/start`, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json()) as { message?: string };
      setMessage(data.message || "تعذر فتح الطلب.");
      return;
    }
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
    const { filters, warning } = clampDateFilters(draft);
    setDraft(filters);
    setApplied(filters);
    if (warning) setMessage(warning);
  }

  function resetFilters() {
    const next = defaultDraft();
    setDraft(next);
    setApplied(next);
    setMessage("");
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="no-print flex flex-col gap-3 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/15 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-4">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-[#14213D] sm:text-2xl">قائمة تأكيد الطلبات</h1>
          <p className="mt-1 text-sm font-bold text-[#14213D]/70">
            عدد النتائج: <span className="rounded bg-[#14213D] px-2 py-0.5 text-[#FCA311]">{filtered.length}</span> من
            أصل {items.length}
          </p>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
          {isSupervisor ? (
            <Link
              href="/cs/assign"
              className="shrink-0 rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white sm:px-4 sm:py-2.5 sm:text-sm"
            >
              توزيع
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setPrintMode("bosta")}
            className="shrink-0 rounded-xl bg-black px-3 py-2 text-xs font-extrabold text-white sm:py-2.5 sm:text-sm"
          >
            طباعة بوسطة
          </button>
          <button
            type="button"
            onClick={() => setPrintMode("sayed_temima")}
            className="shrink-0 rounded-xl bg-black px-3 py-2 text-xs font-extrabold text-white sm:py-2.5 sm:text-sm"
          >
            طباعة تميمة
          </button>
          <button
            type="button"
            onClick={() => setPrintMode("all")}
            className="shrink-0 rounded-xl bg-[#E5E5E5] px-3 py-2 text-xs font-extrabold text-[#14213D] sm:py-2.5 sm:text-sm"
          >
            طباعة الكل
          </button>
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

      <div className="no-print space-y-3 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={draft.query}
            onChange={(e) => patchDraft({ query: e.target.value })}
            placeholder="بحث: موبايل، اسم، عنوان، منتج..."
            className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold lg:col-span-2"
          />
          <select
            value={draft.status}
            onChange={(e) => patchDraft({ status: e.target.value, followUp: "all" })}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
          >
            <option value="all">كل الحالات</option>
            <option value="PENDING">بانتظار</option>
            <option value="IN_PROGRESS">جاري</option>
            <option value="CONFIRMED">تم الحفظ</option>
            <option value="FAILED_CONTACT">لم يرد</option>
            <option value="CANCELLED">لاغى</option>
            <option value="cancelled_or_no_answer">لاغى / لم يرد</option>
          </select>
          {draft.status === "CONFIRMED" ? (
            <select
              value={draft.followUp}
              onChange={(e) => patchDraft({ followUp: e.target.value })}
              className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
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
              className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
            >
              <option value="all">كل الدفع</option>
              <option value="paid">مدفوع</option>
              <option value="awaiting_payment">تحت الدفع</option>
              <option value="cod">عند الاستلام</option>
            </select>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {draft.status === "CONFIRMED" ? (
            <select
              value={draft.payment}
              onChange={(e) => patchDraft({ payment: e.target.value })}
              className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
            >
              <option value="all">كل الدفع</option>
              <option value="paid">مدفوع</option>
              <option value="awaiting_payment">تحت الدفع</option>
              <option value="cod">عند الاستلام</option>
            </select>
          ) : null}
          <select
            value={draft.shipping}
            onChange={(e) => patchDraft({ shipping: e.target.value })}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
          >
            <option value="all">كل شركات الشحن</option>
            <option value="bosta">بوسطة</option>
            <option value="sayed_temima">سيد تميمة</option>
          </select>
          <label className="grid gap-1 text-xs font-bold text-[#14213D]">
            من يوم
            <input
              type="date"
              min={dateMinYmd()}
              max={dateMaxYmd()}
              value={draft.dateFrom}
              onChange={(e) => patchDraft({ dateFrom: e.target.value })}
              className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-[#14213D]">
            إلى يوم
            <input
              type="date"
              min={dateMinYmd()}
              max={dateMaxYmd()}
              value={draft.dateTo}
              onChange={(e) => patchDraft({ dateTo: e.target.value })}
              className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
            />
          </label>
          <select
            value={draft.trackingFilter}
            onChange={(e) =>
              patchDraft({ trackingFilter: e.target.value === "missing" ? "missing" : "all" })
            }
            className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
          >
            <option value="all">كل أرقام التراك</option>
            <option value="missing">بدون رقم تراك</option>
          </select>
          <select
            value={draft.waybillFilter}
            onChange={(e) =>
              patchDraft({ waybillFilter: e.target.value === "not_printed" ? "not_printed" : "all" })
            }
            className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
          >
            <option value="all">كل البوليصات</option>
            <option value="not_printed">لم تُطبع البوليصة</option>
          </select>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={draft.governorate}
            onChange={(e) => patchDraft({ governorate: e.target.value, area: "" })}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
          >
            <option value="">كل المحافظات</option>
            {governorates.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={draft.area}
            onChange={(e) => patchDraft({ area: e.target.value })}
            disabled={!draft.governorate}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold disabled:opacity-50"
          >
            <option value="">كل المناطق</option>
            {areaOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          {isSupervisor ? (
            <select
              value={draft.agentId}
              onChange={(e) => patchDraft({ agentId: e.target.value })}
              className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
            >
              <option value="all">أسماء مسئولى خدمة العملاء</option>
              {agents.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex flex-wrap items-stretch gap-2 sm:col-span-1 lg:col-span-1">
            {isSupervisor ? (
              <select
                value={draft.duplicates}
                onChange={(e) => patchDraft({ duplicates: e.target.value === "only" ? "only" : "all" })}
                className="min-w-[8rem] flex-1 rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
              >
                <option value="all">كل الأوردرات</option>
                <option value="only">المكررة فقط</option>
              </select>
            ) : null}
            <button
              type="button"
              onClick={runFilter}
              className="rounded-xl bg-[#FCA311] px-4 py-2.5 text-sm font-extrabold text-black"
            >
              فلتر
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl bg-[#E5E5E5] px-3 py-2.5 text-sm font-bold text-[#14213D]"
            >
              إعادة
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <p className="no-print rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p>
      ) : null}

      <p className="no-print text-sm font-extrabold text-[#14213D]">نتائج الجدول: {filtered.length} أوردر</p>

      <div className="no-print space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white px-4 py-10 text-center text-[#14213D]/70">
            {items.length === 0 ? (
              isSupervisor ? (
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
                    isSupervisor ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] ${meta.className}`}>{meta.label}</span>
                    <span className="text-base font-extrabold">#{item.wooOrderNumber}</span>
                    <span className="text-xs text-[#14213D]/55">{day}</span>
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
                    ) : (
                      <span className="w-fit rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-800">بدون تراك</span>
                    )}
                    {item.waybillPrinted ? (
                      <span className="w-fit rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">بوليصة طُبعت</span>
                    ) : (
                      <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">بوليصة لم تُطبع</span>
                    )}
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
                    <span className="text-xs">{item.assignedAgent?.name || "—"}</span>
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
                  <div className="flex flex-col items-start gap-1.5 sm:items-end">
                    <span className="rounded-lg bg-[#14213D] px-2.5 py-1 text-base font-extrabold text-[#FCA311]">
                      {item.customerSnapshot?.total || "—"} ج.م
                    </span>
                    {isConfirmed ? (
                      <Link
                        href={`/cs/orders/${item.id}`}
                        className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs font-extrabold text-white"
                      >
                        فتح
                      </Link>
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

      <div className="print-only hidden">
        <h1 className="mb-2 text-center text-lg font-bold">
          شيت مخزن —{" "}
          {printMode === "bosta"
            ? "بوسطة"
            : printMode === "sayed_temima"
              ? "سيد تميمة"
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
                  {["مسلسل", "الرقم", "الاسم", "موبايل", "العنوان", "المنتجات", "الإجمالي", "الشحن", "المسؤول"].map(
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
                      <td className="border border-black px-1 py-1" dir="ltr">
                        {formatOrderModels(item)}
                      </td>
                      <td className="border border-black px-1 py-1">{item.customerSnapshot?.total}</td>
                      <td className="border border-black px-1 py-1">{SAYED_TEMIMA_SHIPPING_EGP} ج</td>
                      <td className="border border-black px-1 py-1">{item.assignedAgent?.name || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
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
                  <p>الإجمالي الكلي (أوردرات + شحن): {(ordersTotal + shippingTotal).toLocaleString("ar-EG")} ج.م</p>
                </div>
              );
            })()}
          </>
        ) : (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                {["الرقم", "الاسم", "موبايل", "العنوان", "الإجمالي", "الشحن", "المسؤول"].map((h) => (
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
