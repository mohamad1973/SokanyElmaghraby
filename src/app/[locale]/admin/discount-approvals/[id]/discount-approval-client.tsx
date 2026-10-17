"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

type Item = {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  total: string;
  discountAmount: number | null;
  discountApprovalStatus: string;
  assignedAgent?: { id: number; name: string } | null;
};

export function DiscountApprovalClient({ item }: { item: Item }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(item.discountApprovalStatus);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setMessage("");
    const res = await fetch(`/api/admin/discount-approvals/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = (await res.json()) as { message?: string; status?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر حفظ القرار.");
      return;
    }
    setStatus(data.status || decision);
    setMessage(decision === "approved" ? "تمت الموافقة على الخصم." : "تم رفض الخصم.");
    router.refresh();
  }

  const total = Number(String(item.total || "").replace(/,/g, ""));
  const discount = Number(item.discountAmount) || 0;
  const after = Number.isFinite(total) ? Math.max(0, total - discount) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin/discount-approvals" className="text-sm font-bold underline">
            رجوع لطلبات الخصم
          </Link>
          <h1 className="text-2xl font-extrabold text-[#14213D]">مراجعة خصم #{item.wooOrderNumber}</h1>
        </div>
        <Link
          href={`/admin/orders/${item.wooOrderId}`}
          className="rounded-xl bg-[#14213D] px-4 py-2 text-sm font-extrabold text-white"
        >
          فتح أوردر العميل
        </Link>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-bold text-zinc-500">العميل</dt>
            <dd className="font-extrabold">{item.customerName || "—"}</dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">الهاتف</dt>
            <dd dir="ltr" className="font-extrabold">
              {item.phone || "—"}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">إجمالي الأوردر</dt>
            <dd className="font-extrabold">{item.total || "—"}</dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">قيمة الخصم</dt>
            <dd className="font-extrabold text-[#FCA311]">{item.discountAmount ?? "—"} ج.م</dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">بعد الخصم</dt>
            <dd className="font-extrabold">{after == null ? "—" : `${after} ج.م`}</dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">الوكيلة</dt>
            <dd className="font-extrabold">{item.assignedAgent?.name || "—"}</dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">الحالة</dt>
            <dd className="font-extrabold">
              {status === "pending"
                ? "بانتظار قرارك"
                : status === "approved"
                  ? "تمت الموافقة"
                  : status === "rejected"
                    ? "مرفوض"
                    : status}
            </dd>
          </div>
        </dl>
      </section>

      {message ? <p className="rounded-xl bg-[#FCA311]/20 px-3 py-2 text-sm font-bold">{message}</p> : null}

      {status === "pending" ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("approved")}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
          >
            موافقة على الخصم
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("rejected")}
            className="rounded-xl bg-red-700 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
          >
            رفض الخصم
          </button>
        </div>
      ) : null}
    </div>
  );
}
