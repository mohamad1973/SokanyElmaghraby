"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type QueueItem = {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  status: string;
  assignedAgent?: { name: string } | null;
  customerSnapshot?: {
    customerName?: string;
    phone?: string;
    total?: string;
  } | null;
  createdAt: string;
};

const statusLabel: Record<string, string> = {
  PENDING: "بانتظار التأكيد",
  IN_PROGRESS: "جاري المكالمة",
  CONFIRMED: "مؤكد",
  FAILED_CONTACT: "تعذر التواصل",
};

export function CsQueueClient({ initialItems }: { initialItems: QueueItem[] }) {
  const router = useRouter();
  const [items] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function syncOrders() {
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/cs/sync", { method: "POST" });
    const data = (await res.json()) as { message?: string; imported?: number };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر المزامنة.");
      return;
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
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">قائمة تأكيد الطلبات</h1>
          <p className="mt-1 text-sm text-slate-600">استيراد من Woo سوكاني ثم فتح صفحة المكالمة.</p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void syncOrders()}
          className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-black disabled:opacity-60"
        >
          {loading ? "جاري المزامنة..." : "مزامنة الطلبات الآن"}
        </button>
      </div>

      {message ? <p className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">{message}</p> : null}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-right">
            <tr>
              <th className="px-4 py-3">الطلب</th>
              <th className="px-4 py-3">العميل</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">المسؤول</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  لا توجد طلبات. اضغط مزامنة لجلب الطلبات الجديدة من ووردبريس.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-black/5">
                  <td className="px-4 py-3 font-bold">#{item.wooOrderNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold">{item.customerSnapshot?.customerName || "—"}</p>
                    <p className="text-xs text-slate-500" dir="ltr">
                      {item.customerSnapshot?.phone || ""}
                    </p>
                    <p className="text-xs text-slate-500">{item.customerSnapshot?.total || ""} ج.م</p>
                  </td>
                  <td className="px-4 py-3">{statusLabel[item.status] || item.status}</td>
                  <td className="px-4 py-3">{item.assignedAgent?.name || "—"}</td>
                  <td className="px-4 py-3">
                    {item.status === "CONFIRMED" ? (
                      <Link href={`/cs/orders/${item.id}`} className="font-bold text-slate-700 underline">
                        عرض
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void openOrder(item.id)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                      >
                        فتح المكالمة
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
