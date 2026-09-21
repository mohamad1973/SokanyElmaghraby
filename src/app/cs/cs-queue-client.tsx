"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatCairoOrderDateTime } from "@/lib/cs/order-window";

export type CsQueueItem = {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  status: string;
  assignedAgent?: { name: string } | null;
  customerSnapshot?: {
    customerName?: string;
    phone?: string;
    total?: string;
    dateCreated?: string;
    paymentMethod?: string;
    paidOnlineHighlight?: boolean;
  } | null;
  createdAt: string;
};

const statusMeta: Record<string, { label: string; className: string }> = {
  PENDING: { label: "بانتظار التأكيد", className: "bg-amber-100 text-amber-900 ring-amber-300" },
  IN_PROGRESS: { label: "جاري المكالمة", className: "bg-sky-100 text-sky-900 ring-sky-300" },
  CONFIRMED: { label: "مؤكد", className: "bg-orange-200 text-orange-950 ring-orange-400" },
  FAILED_CONTACT: { label: "تعذر التواصل", className: "bg-rose-100 text-rose-900 ring-rose-300" },
};

export function CsQueueClient({ initialItems }: { initialItems: CsQueueItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

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
    if (data.items) {
      setItems(data.items);
    }
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

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-white/80 p-5 shadow-lg ring-1 ring-teal-200/60 backdrop-blur">
        <div>
          <p className="text-sm font-bold text-teal-700">لوحة المتابعة</p>
          <h1 className="mt-1 text-3xl font-extrabold text-slate-900">قائمة تأكيد الطلبات</h1>
          <p className="mt-2 text-sm text-slate-600">طلبات اليوم وأمس فقط من Woo سوكاني.</p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void syncOrders()}
          className="rounded-2xl bg-brand-gold px-5 py-3.5 text-sm font-extrabold text-black shadow-md transition hover:brightness-95 disabled:opacity-60"
        >
          {loading ? "جاري المزامنة..." : "مزامنة الطلبات الآن"}
        </button>
      </div>

      {message ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">
          {message}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-3xl bg-white/70 px-6 py-14 text-center text-slate-500 shadow-md ring-1 ring-slate-200">
          لا توجد طلبات لليوم أو أمس. اضغط مزامنة لجلب الطلبات من ووردبريس.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {items.map((item) => {
            const meta = statusMeta[item.status] || {
              label: item.status,
              className: "bg-slate-100 text-slate-800 ring-slate-300",
            };
            const confirmed = item.status === "CONFIRMED";
            const paidOnline = Boolean(item.customerSnapshot?.paidOnlineHighlight);
            const when = formatCairoOrderDateTime(item.customerSnapshot?.dateCreated);

            return (
              <article
                key={item.id}
                className={`flex flex-col justify-between rounded-3xl p-4 shadow-lg ring-1 transition hover:-translate-y-0.5 hover:shadow-xl ${
                  confirmed
                    ? "bg-orange-100 ring-orange-400"
                    : paidOnline
                      ? "bg-emerald-50 ring-emerald-400"
                      : "bg-white ring-teal-100"
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xl font-extrabold ${confirmed ? "text-orange-900" : "text-teal-800"}`}>
                      #{item.wooOrderNumber}
                    </p>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${meta.className}`}>
                      {meta.label}
                    </span>
                  </div>

                  {paidOnline ? (
                    <p className="rounded-xl bg-emerald-600 px-2.5 py-1.5 text-center text-[11px] font-extrabold text-white">
                      مدفوع أونلاين — فوري / محفظة
                    </p>
                  ) : null}

                  <div>
                    <p className="text-base font-bold text-slate-900">
                      {item.customerSnapshot?.customerName || "عميل بدون اسم"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500" dir="ltr">
                      {item.customerSnapshot?.phone || "—"}
                    </p>
                    <p className={`mt-1.5 text-sm font-extrabold ${confirmed ? "text-orange-800" : "text-cyan-700"}`}>
                      {item.customerSnapshot?.total || "—"} ج.م
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/70 px-2.5 py-2 text-[11px] font-bold text-slate-700 ring-1 ring-black/5">
                    <p>{when.absolute}</p>
                    {when.relative ? <p className="mt-0.5 text-teal-700">{when.relative}</p> : null}
                  </div>

                  <p className="text-[11px] text-slate-500">المسؤول: {item.assignedAgent?.name || "غير معيَّن"}</p>
                </div>
                <div className="mt-4">
                  {confirmed ? (
                    <Link
                      href={`/cs/orders/${item.id}`}
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-orange-600 px-3 py-2.5 text-sm font-extrabold text-white"
                    >
                      عرض التأكيد
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void openOrder(item.id)}
                      className="w-full rounded-2xl bg-teal-700 px-3 py-2.5 text-sm font-extrabold text-white shadow"
                    >
                      فتح المكالمة
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
