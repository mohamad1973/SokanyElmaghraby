"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SHIPPING_COMPANY_LABEL } from "@/lib/cs/checklist";
import { listCsGovernorates, mergeAreaOptions } from "@/lib/cs/egypt-areas";
import { cairoTodayYmd, cairoYesterdayYmd, formatCairoOrderDate, isWithinCairoDateRange } from "@/lib/cs/order-window";
import { parseWooOrderNumber } from "@/lib/cs/assignments-client";

export type CsQueueItem = {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  status: string;
  shippingCompany?: string | null;
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
    paidOnlineHighlight?: boolean;
    wooStatus?: string;
    trackingNumber?: string | null;
    items?: Array<{ name: string; quantity?: number }>;
  } | null;
  createdAt: string;
};

const statusMeta: Record<string, { label: string; className: string }> = {
  PENDING: { label: "بانتظار", className: "bg-[#E5E5E5] text-[#14213D]" },
  IN_PROGRESS: { label: "جاري", className: "bg-[#14213D] text-white" },
  CONFIRMED: { label: "تم الحفظ", className: "bg-[#FCA311] text-black" },
  FAILED_CONTACT: { label: "تعذر الوصول", className: "bg-black text-white" },
};

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
};

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
  };
}

function searchableText(item: CsQueueItem) {
  const snap = item.customerSnapshot;
  const products = (snap?.items || []).map((i) => i.name).join(" ");
  return [
    item.wooOrderNumber,
    item.status,
    item.shippingCompany,
    item.assignedAgent?.name,
    snap?.customerName,
    snap?.phone,
    snap?.address,
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

function applyFilters(items: CsQueueItem[], f: DraftFilters) {
  const q = f.query.trim().toLowerCase();
  return items
    .filter((item) => {
      if (q && !searchableText(item).includes(q)) return false;
      if (f.status !== "all" && item.status !== f.status) return false;
      if (f.status === "CONFIRMED" && f.followUp !== "all") {
        if (f.followUp === "handed" && !item.handedToCarrier) return false;
        if (f.followUp === "delivered" && !item.deliveredToCustomer) return false;
        if (f.followUp === "followup" && !item.customerFollowUp) return false;
        if (f.followUp === "handed_pending" && item.handedToCarrier) return false;
        if (f.followUp === "delivered_pending" && item.deliveredToCustomer) return false;
        if (f.followUp === "followup_pending" && item.customerFollowUp) return false;
      }
      if (f.payment === "paid_online" && !item.customerSnapshot?.paidOnlineHighlight) return false;
      if (f.payment === "cod" && item.customerSnapshot?.paidOnlineHighlight) return false;
      if (f.shipping !== "all" && (item.shippingCompany || "") !== f.shipping) return false;
      if (f.agentId !== "all" && String(item.assignedAgent?.id || "") !== f.agentId) return false;
      if (f.governorate && (item.customerSnapshot?.governorate || "") !== f.governorate) return false;
      if (f.area && (item.customerSnapshot?.area || "") !== f.area) return false;
      if (f.dateFrom && f.dateTo) {
        if (!isWithinCairoDateRange(item.customerSnapshot?.dateCreated, f.dateFrom, f.dateTo)) return false;
      }
      return true;
    })
    .sort((a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber));
}

type Props = {
  initialItems: CsQueueItem[];
  isSupervisor?: boolean;
  agents?: Array<{ id: number; name: string }>;
};

export function CsQueueClient({ initialItems, isSupervisor, agents = [] }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(defaultDraft);
  const [applied, setApplied] = useState<DraftFilters>(defaultDraft);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const governorates = useMemo(() => {
    const fromOrders = items.map((i) => i.customerSnapshot?.governorate || "").filter(Boolean);
    return [...new Set([...listCsGovernorates(), ...fromOrders])].sort((a, b) => a.localeCompare(b, "ar"));
  }, [items]);

  const areaOptions = useMemo(() => {
    const gov = draft.governorate;
    if (!gov) return [] as string[];
    const fromOrders = items
      .filter((i) => i.customerSnapshot?.governorate === gov)
      .map((i) => i.customerSnapshot?.area || "")
      .filter(Boolean);
    return mergeAreaOptions(gov, fromOrders);
  }, [draft.governorate, items]);

  const filtered = useMemo(() => applyFilters(items, applied), [items, applied]);

  async function syncOrders() {
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/cs/sync", { method: "POST" });
    const data = (await res.json()) as {
      message?: string;
      imported?: number;
      items?: CsQueueItem[];
    };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر المزامنة.");
      return;
    }
    if (data.items) setItems(data.items);
    setMessage(`تمت المزامنة. طلبات جديدة: ${data.imported ?? 0}`);
    router.refresh();
  }

  async function openOrder(id: number) {
    const res = await fetch(`/api/cs/confirmations/${id}/start`, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json()) as { message?: string };
      setMessage(data.message || "تعذر فتح الطلب.");
      return;
    }
    router.push(`/cs/orders/${id}`);
  }

  function patchDraft(patch: Partial<DraftFilters>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function runFilter() {
    setApplied({ ...draft });
  }

  function resetFilters() {
    const next = defaultDraft();
    setDraft(next);
    setApplied(next);
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="no-print flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/15">
        <div>
          <h1 className="text-2xl font-extrabold text-[#14213D]">قائمة تأكيد الطلبات</h1>
          <p className="mt-1 text-sm font-bold text-[#14213D]/70">
            عدد النتائج: <span className="text-[#FCA311]">{filtered.length}</span> من أصل {items.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSupervisor ? (
            <Link href="/cs/assign" className="rounded-xl bg-[#14213D] px-4 py-2.5 text-sm font-extrabold text-white">
              توزيع الأوردرات
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-black px-4 py-2.5 text-sm font-extrabold text-white"
          >
            طباعة A4
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void syncOrders()}
            className="rounded-xl bg-[#FCA311] px-4 py-2.5 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جاري المزامنة..." : "مزامنة"}
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
            <option value="FAILED_CONTACT">تعذر الوصول</option>
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
              <option value="paid_online">مدفوع أونلاين</option>
              <option value="cod">غير مدفوع أونلاين</option>
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
              <option value="paid_online">مدفوع أونلاين</option>
              <option value="cod">غير مدفوع أونلاين</option>
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
              value={draft.dateFrom}
              onChange={(e) => patchDraft({ dateFrom: e.target.value })}
              className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-[#14213D]">
            إلى يوم
            <input
              type="date"
              value={draft.dateTo}
              onChange={(e) => patchDraft({ dateTo: e.target.value })}
              className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
            />
          </label>
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
          ) : (
            <div />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runFilter}
              className="flex-1 rounded-xl bg-[#FCA311] px-4 py-2.5 text-sm font-extrabold text-black"
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

      <p className="no-print text-sm font-extrabold text-[#14213D]">
        نتائج الجدول: {filtered.length} أوردر
      </p>

      <div className="no-print space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white px-4 py-10 text-center text-[#14213D]/70">
            {items.length === 0 ? (
              isSupervisor ? (
                <p className="font-bold">لا توجد طلبات في النطاق — راجعي Woo أو رسالة المزامنة أو وسّعي تاريخ الفلتر.</p>
              ) : (
                <p className="font-bold">لم يُوزَّع عليكِ نطاق أوردرات بعد — اطلبي من المشرفة (منى عباس / الأدمن).</p>
              )
            ) : (
              <p className="font-bold">لا توجد نتائج مطابقة — اضغطي «فلتر» بعد تعديل الشروط أو أعيدي الضبط.</p>
            )}
          </div>
        ) : (
          filtered.map((item) => {
            const confirmed = item.status === "CONFIRMED";
            const paidOnline = Boolean(item.customerSnapshot?.paidOnlineHighlight);
            const meta = statusMeta[item.status] || { label: item.status, className: "bg-[#E5E5E5]" };
            const day = formatCairoOrderDate(item.customerSnapshot?.dateCreated);
            const addr =
              item.customerSnapshot?.addressFull ||
              [item.customerSnapshot?.address, item.customerSnapshot?.area, item.customerSnapshot?.governorate]
                .filter(Boolean)
                .join(" — ");

            return (
              <div
                key={item.id}
                className={`rounded-xl px-3 py-2.5 shadow-sm ring-1 ${
                  confirmed
                    ? "bg-[#FCA311]/25 ring-[#FCA311]"
                    : paidOnline
                      ? "bg-white ring-[#14213D]/40"
                      : "bg-white ring-[#E5E5E5]"
                }`}
              >
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm font-bold text-[#14213D] sm:grid-cols-4">
                  <div className="flex flex-col gap-0.5">
                    <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] ${meta.className}`}>{meta.label}</span>
                    <span className="text-base font-extrabold">#{item.wooOrderNumber}</span>
                    <span className="text-xs text-[#14213D]/60">{day}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span>{item.customerSnapshot?.customerName || "—"}</span>
                    <span className="text-xs" dir="ltr">
                      {item.customerSnapshot?.phone || ""}
                    </span>
                    {paidOnline ? <span className="w-fit rounded bg-[#14213D] px-1.5 py-0.5 text-[10px] text-white">مدفوع</span> : null}
                  </div>
                  <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
                    <span className="text-xs leading-snug">{addr || "—"}</span>
                    <span className="text-xs">
                      {item.shippingCompany ? SHIPPING_COMPANY_LABEL[item.shippingCompany] || item.shippingCompany : "—"}
                      {" · "}
                      {item.assignedAgent?.name || "—"}
                    </span>
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <span className="rounded bg-[#FCA311] px-2 py-1 text-base font-extrabold text-black underline decoration-[#14213D] decoration-2 underline-offset-4">
                      {item.customerSnapshot?.total || "—"} ج.م
                    </span>
                    {confirmed ? (
                      <Link href={`/cs/orders/${item.id}`} className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs font-extrabold text-white">
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
        <h1 className="mb-3 text-center text-lg font-bold">شيت تأكيد الطلبات — Tooliano CS</h1>
        <p className="mb-2 text-center text-xs">
          {new Date().toLocaleString("ar-EG")} · عدد الصفوف: {filtered.length}
        </p>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              {["الرقم", "الاسم", "موبايل", "العنوان", "الإجمالي", "الشحن", "الوكيلة", "حالة CS"].map((h) => (
                <th key={h} className="border border-black px-1 py-1 text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td className="border border-black px-1 py-1">#{item.wooOrderNumber}</td>
                <td className="border border-black px-1 py-1">{item.customerSnapshot?.customerName}</td>
                <td className="border border-black px-1 py-1" dir="ltr">
                  {item.customerSnapshot?.phone}
                </td>
                <td className="border border-black px-1 py-1">
                  {item.customerSnapshot?.addressFull || item.customerSnapshot?.address}
                </td>
                <td className="border border-black px-1 py-1">{item.customerSnapshot?.total}</td>
                <td className="border border-black px-1 py-1">
                  {item.shippingCompany ? SHIPPING_COMPANY_LABEL[item.shippingCompany] || item.shippingCompany : ""}
                </td>
                <td className="border border-black px-1 py-1">{item.assignedAgent?.name || ""}</td>
                <td className="border border-black px-1 py-1">{statusMeta[item.status]?.label || item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
