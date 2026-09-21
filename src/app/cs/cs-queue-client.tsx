"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SHIPPING_COMPANY_LABEL } from "@/lib/cs/checklist";
import { formatCairoOrderDateTime } from "@/lib/cs/order-window";
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
  PENDING: { label: "بانتظار", className: "bg-amber-100 text-amber-900" },
  IN_PROGRESS: { label: "جاري", className: "bg-sky-100 text-sky-900" },
  CONFIRMED: { label: "مؤكد", className: "bg-orange-200 text-orange-950" },
  FAILED_CONTACT: { label: "تعذر", className: "bg-rose-100 text-rose-900" },
};

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
    snap?.total,
    snap?.paymentMethod,
    snap?.wooStatus,
    snap?.trackingNumber,
    products,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [wooStatusFilter, setWooStatusFilter] = useState("all");
  const [shippingFilter, setShippingFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (q && !searchableText(item).includes(q)) return false;
        if (paymentFilter === "paid_online" && !item.customerSnapshot?.paidOnlineHighlight) return false;
        if (paymentFilter === "cod" && item.customerSnapshot?.paidOnlineHighlight) return false;
        if (wooStatusFilter !== "all" && (item.customerSnapshot?.wooStatus || "") !== wooStatusFilter) {
          return false;
        }
        if (shippingFilter !== "all" && (item.shippingCompany || "") !== shippingFilter) return false;
        if (agentFilter !== "all" && String(item.assignedAgent?.id || "") !== agentFilter) return false;
        return true;
      })
      .sort(
        (a, b) => parseWooOrderNumber(b.wooOrderNumber) - parseWooOrderNumber(a.wooOrderNumber),
      );
  }, [items, query, paymentFilter, wooStatusFilter, shippingFilter, agentFilter]);

  const wooStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.customerSnapshot?.wooStatus) set.add(item.customerSnapshot.wooStatus);
    }
    return [...set].sort();
  }, [items]);

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

  function printVisible() {
    window.print();
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="no-print flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-white/80 p-4 shadow ring-1 ring-teal-200/60">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">قائمة تأكيد الطلبات</h1>
          <p className="mt-1 text-sm text-slate-600">اليوم وأمس · مرتبة برقم الأوردر (الأحدث فوق)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSupervisor ? (
            <Link
              href="/cs/assign"
              className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-extrabold text-white"
            >
              توزيع الأوردرات
            </Link>
          ) : null}
          <button
            type="button"
            onClick={printVisible}
            className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-extrabold text-white"
          >
            طباعة A4
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void syncOrders()}
            className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جاري المزامنة..." : "مزامنة"}
          </button>
        </div>
      </div>

      <div className="no-print grid gap-2 rounded-2xl bg-white/90 p-3 shadow ring-1 ring-teal-100 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث: موبايل، اسم، عنوان، منتج، تتبع..."
          className="rounded-xl border border-teal-200 px-3 py-2 text-sm font-bold lg:col-span-2"
        />
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="rounded-xl border border-teal-200 px-3 py-2 text-sm font-bold"
        >
          <option value="all">كل الدفع</option>
          <option value="paid_online">مدفوع أونلاين</option>
          <option value="cod">غير مدفوع أونلاين</option>
        </select>
        <select
          value={wooStatusFilter}
          onChange={(e) => setWooStatusFilter(e.target.value)}
          className="rounded-xl border border-teal-200 px-3 py-2 text-sm font-bold"
        >
          <option value="all">كل حالات Woo</option>
          {wooStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={shippingFilter}
          onChange={(e) => setShippingFilter(e.target.value)}
          className="rounded-xl border border-teal-200 px-3 py-2 text-sm font-bold"
        >
          <option value="all">كل شركات الشحن</option>
          <option value="bosta">بوسطة</option>
          <option value="sayed_temima">سيد تميمة</option>
        </select>
        {isSupervisor ? (
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-xl border border-teal-200 px-3 py-2 text-sm font-bold sm:col-span-2 lg:col-span-1"
          >
            <option value="all">كل الوكيلات</option>
            {agents.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {message ? (
        <p className="no-print rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{message}</p>
      ) : null}

      {/* Screen list — one compact row per order */}
      <div className="no-print space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white/70 px-4 py-10 text-center text-slate-600">
            {items.length === 0 ? (
              isSupervisor ? (
                <p className="font-bold">
                  لا توجد طلبات لليوم/أمس بالحالات المطلوبة — راجعي Woo أو رسالة المزامنة.
                </p>
              ) : (
                <p className="font-bold">
                  لم يُوزَّع عليكِ نطاق أوردرات بعد — اطلبي من المشرفة (منى عباس / الأدمن).
                </p>
              )
            ) : (
              <p className="font-bold">لا توجد نتائج مطابقة للبحث أو الفلاتر.</p>
            )}
          </div>
        ) : (
          filtered.map((item) => {
            const confirmed = item.status === "CONFIRMED";
            const paidOnline = Boolean(item.customerSnapshot?.paidOnlineHighlight);
            const when = formatCairoOrderDateTime(item.customerSnapshot?.dateCreated);
            const meta = statusMeta[item.status] || { label: item.status, className: "bg-slate-100" };
            const products = (item.customerSnapshot?.items || [])
              .map((i) => `${i.quantity || 1}×${i.name}`)
              .join(" · ");

            return (
              <div
                key={item.id}
                className={`flex min-w-0 items-center gap-2 overflow-hidden rounded-xl px-3 py-2 text-[11px] font-bold shadow-sm ring-1 ${
                  confirmed
                    ? "bg-orange-100 ring-orange-400"
                    : paidOnline
                      ? "bg-emerald-50 ring-emerald-400"
                      : "bg-white ring-teal-100"
                }`}
              >
                <span className={`shrink-0 rounded-full px-2 py-0.5 ${meta.className}`}>{meta.label}</span>
                <span className="shrink-0 text-sm font-extrabold text-teal-900">#{item.wooOrderNumber}</span>
                {paidOnline ? (
                  <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">مدفوع</span>
                ) : null}
                <span className="min-w-0 truncate text-slate-900">
                  {item.customerSnapshot?.customerName || "—"}
                </span>
                <span className="shrink-0 text-slate-500" dir="ltr">
                  {item.customerSnapshot?.phone || ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {item.customerSnapshot?.address || ""}
                </span>
                <span className="hidden shrink-0 text-cyan-800 lg:inline">{item.customerSnapshot?.total} ج.م</span>
                <span className="hidden shrink-0 text-slate-500 xl:inline">{when.absolute}</span>
                <span className="hidden shrink-0 text-teal-700 xl:inline">{when.relative}</span>
                <span className="hidden min-w-0 max-w-[12rem] truncate text-slate-500 2xl:inline">{products}</span>
                {item.customerSnapshot?.trackingNumber ? (
                  <span className="hidden shrink-0 text-indigo-700 lg:inline" dir="ltr">
                    {item.customerSnapshot.trackingNumber}
                  </span>
                ) : null}
                {item.shippingCompany ? (
                  <span className="shrink-0 text-slate-700">
                    {SHIPPING_COMPANY_LABEL[item.shippingCompany] || item.shippingCompany}
                  </span>
                ) : null}
                <span className="shrink-0 text-slate-500">{item.assignedAgent?.name || "—"}</span>
                {confirmed ? (
                  <Link
                    href={`/cs/orders/${item.id}`}
                    className="shrink-0 rounded-lg bg-orange-600 px-2.5 py-1.5 text-white"
                  >
                    فتح
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void openOrder(item.id)}
                    className="shrink-0 rounded-lg bg-teal-700 px-2.5 py-1.5 text-white"
                  >
                    مكالمة
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Print-only A4 table */}
      <div className="print-only hidden">
        <h1 className="mb-3 text-center text-lg font-bold">شيت تأكيد الطلبات — Tooliano CS</h1>
        <p className="mb-2 text-center text-xs">
          {new Date().toLocaleString("ar-EG")} · عدد الصفوف: {filtered.length}
        </p>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              {[
                "الرقم",
                "الاسم",
                "موبايل",
                "العنوان",
                "الإجمالي",
                "الدفع",
                "حالة Woo",
                "الشحن",
                "تتبع",
                "منتجات",
                "الوكيلة",
                "حالة CS",
              ].map((h) => (
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
                <td className="border border-black px-1 py-1">{item.customerSnapshot?.address}</td>
                <td className="border border-black px-1 py-1">{item.customerSnapshot?.total}</td>
                <td className="border border-black px-1 py-1">{item.customerSnapshot?.paymentMethod}</td>
                <td className="border border-black px-1 py-1">{item.customerSnapshot?.wooStatus}</td>
                <td className="border border-black px-1 py-1">
                  {item.shippingCompany
                    ? SHIPPING_COMPANY_LABEL[item.shippingCompany] || item.shippingCompany
                    : ""}
                </td>
                <td className="border border-black px-1 py-1" dir="ltr">
                  {item.customerSnapshot?.trackingNumber || ""}
                </td>
                <td className="border border-black px-1 py-1">
                  {(item.customerSnapshot?.items || []).map((i) => i.name).join("، ")}
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
