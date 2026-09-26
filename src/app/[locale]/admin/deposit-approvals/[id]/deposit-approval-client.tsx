"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Link } from "@/i18n/navigation";
import { formatDepositPaidClock } from "@/lib/cs/order-window";

type Item = {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  total: string;
  depositAmount: number | null;
  depositPayMethod: string | null;
  depositFromNumber: string | null;
  depositInstapayName?: string | null;
  depositToPhone: string | null;
  depositToMethod: string | null;
  depositPaidAt: string | null;
  depositProofUrl: string | null;
  depositApprovalStatus: string;
  assignedAgent?: { id: number; name: string } | null;
};

const METHOD_LABEL: Record<string, string> = {
  wallet: "محفظة",
  instapay: "انستا",
};

export function DepositApprovalClient({ item }: { item: Item }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(item.depositApprovalStatus);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setMessage("");
    const res = await fetch(`/api/admin/deposit-approvals/${item.id}`, {
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
    setMessage(decision === "approved" ? "تمت الموافقة — سيظهر للموظفة أن العميل دفع." : "تم الرفض — سيظهر للموظفة أن العميل لم يدفع.");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin/orders" className="text-sm font-bold underline">
            رجوع للأوردرات
          </Link>
          <h1 className="text-2xl font-extrabold text-[#14213D]">مراجعة ديبوزت #{item.wooOrderNumber}</h1>
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
            <dt className="font-bold text-zinc-500">الوكيلة</dt>
            <dd className="font-extrabold">{item.assignedAgent?.name || "—"}</dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">قيمة المقدم</dt>
            <dd className="font-extrabold text-[#0D9488]">{item.depositAmount ?? "—"} ج.م</dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">وقت الدفع</dt>
            <dd className="font-extrabold">
              {item.depositPaidAt ? formatDepositPaidClock(item.depositPaidAt) : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">الدفع من</dt>
            <dd className="font-extrabold">
              {METHOD_LABEL[item.depositPayMethod || ""] || item.depositPayMethod || "—"} ·{" "}
              <span dir="ltr">{item.depositFromNumber || "—"}</span>
              {item.depositInstapayName ? ` · ${item.depositInstapayName}` : ""}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-zinc-500">الدفع إلى</dt>
            <dd className="font-extrabold">
              <span dir="ltr">{item.depositToPhone || "—"}</span> ·{" "}
              {METHOD_LABEL[item.depositToMethod || ""] || item.depositToMethod || "—"}
            </dd>
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

      {item.depositProofUrl ? (
        <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-black/5">
          <p className="mb-2 text-sm font-extrabold">صورة التحويل</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.depositProofUrl}
            alt="إثبات التحويل"
            className="max-h-[28rem] w-full rounded-xl border border-black/10 object-contain"
          />
        </section>
      ) : null}

      {message ? <p className="rounded-xl bg-[#FCA311]/20 px-3 py-2 text-sm font-bold">{message}</p> : null}

      {status === "pending" ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("approved")}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
          >
            موافقة — العميل دفع
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("rejected")}
            className="rounded-xl bg-red-700 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
          >
            رفض — العميل لم يدفع
          </button>
        </div>
      ) : null}
    </div>
  );
}
