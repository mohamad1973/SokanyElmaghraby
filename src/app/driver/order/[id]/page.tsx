"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AssignmentDetail = {
  id: number;
  status: string;
  shipment: {
    wooOrderNumber: string;
    receiverName: string;
    receiverPhone: string;
    addressLine: string;
    governorate: string;
    area: string;
    codAmount: string | number;
  };
};

export default function DriverOrderPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = String(params.id || "");
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/driver/assignments/${assignmentId}`);
      const data = await response.json();
      setAssignment(data.assignment || null);
    }

    void load();
  }, [assignmentId]);

  async function postAction(action: "start" | "confirm" | "fail", extra?: Record<string, string>) {
    setLoading(true);
    setMessage("");

    const response = await fetch(`/api/driver/assignments/${assignmentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });

    const data = await response.json();
    setLoading(false);
    setMessage(data.message || (response.ok ? "تم." : "تعذر التنفيذ."));

    if (response.ok) {
      router.refresh();
      if (action === "confirm") {
        router.push("/driver/route");
      }
    }
  }

  if (!assignment) {
    return <p className="text-sm text-zinc-500">جاري التحميل...</p>;
  }

  const phone = assignment.shipment.receiverPhone;

  return (
    <div className="space-y-4">
      <Link href="/driver/route" className="text-sm font-bold text-zinc-600">← رجوع للمسار</Link>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-xs text-zinc-500">طلب #{assignment.shipment.wooOrderNumber}</p>
        <h1 className="text-xl font-bold">{assignment.shipment.receiverName}</h1>
        <p className="mt-2 text-sm">{assignment.shipment.addressLine}</p>
        <p className="text-sm text-zinc-600">{assignment.shipment.governorate} — {assignment.shipment.area}</p>
        <p className="mt-2 font-bold">COD: {String(assignment.shipment.codAmount)}</p>
        <p className="mt-1 text-sm">الحالة: {assignment.status}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={`tel:${phone}`} className="rounded-lg border px-3 py-3 text-center text-sm font-bold">اتصال</a>
          <a
            href={`https://wa.me/${phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border px-3 py-3 text-center text-sm font-bold"
          >
            واتساب
          </a>
        </div>
      </div>

      {assignment.status !== "delivered" ? (
        <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <button
            type="button"
            disabled={loading}
            onClick={() => postAction("start")}
            className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            بدء التوصيل
          </button>

          <label className="grid gap-2 text-sm font-bold">
            كود التسليم من العميل
            <input
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              inputMode="numeric"
              className="rounded-lg border px-3 py-3 text-center text-lg tracking-widest"
              placeholder="000000"
            />
          </label>

          <button
            type="button"
            disabled={loading || otp.length < 4}
            onClick={() => postAction("confirm", { otp })}
            className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            تأكيد التسليم
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => postAction("fail", { reason: "تعذر التسليم" })}
            className="w-full rounded-lg bg-red-100 px-4 py-3 text-sm font-bold text-red-700 disabled:opacity-60"
          >
            فشل التسليم
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-green-50 p-4 text-center font-bold text-green-700">تم التسليم بنجاح</div>
      )}

      {message ? <p className="text-sm text-zinc-600">{message}</p> : null}
    </div>
  );
}
