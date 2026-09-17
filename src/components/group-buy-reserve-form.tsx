"use client";

import { FormEvent, useState } from "react";

type Props = {
  submissionId: string;
  remaining: number;
  groupPrice: number;
};

export function GroupBuyReserveForm({ submissionId, remaining, groupPrice }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/group-buy/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          quantity: Number(form.get("quantity") || 1),
          buyerPhone: String(form.get("buyerPhone") || ""),
          buyerName: String(form.get("buyerName") || ""),
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        depositAmount?: number;
        codAmount?: number;
      };
      if (!response.ok) {
        setError(data.message || "تعذر الحجز.");
        return;
      }
      setMessage(
        `${data.message || "تم الحجز."} عربون تقريبي: ${data.depositAmount} ج.م — المتبقي عند الاستلام: ${data.codAmount} ج.م`,
      );
    } catch {
      setError("خطأ في الاتصال.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-[2rem] bg-brand-cream p-6">
      <h2 className="text-xl font-bold">احجز الآن</h2>
      <p className="text-sm text-zinc-600">
        السعر الجماعي {groupPrice} ج.م — المتبقي {remaining} قطعة
      </p>
      <label className="block text-sm font-bold">
        الكمية
        <input
          name="quantity"
          type="number"
          min={1}
          max={Math.max(1, remaining)}
          defaultValue={1}
          required
          className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
        />
      </label>
      <label className="block text-sm font-bold">
        الاسم
        <input name="buyerName" className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-4 py-3" />
      </label>
      <label className="block text-sm font-bold">
        موبايل
        <input
          name="buyerPhone"
          required
          className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      <button
        type="submit"
        disabled={loading || remaining < 1}
        className="rounded-full bg-brand-gold px-6 py-3 text-sm font-bold text-black disabled:opacity-50"
      >
        {loading ? "جاري الحجز..." : "تأكيد الحجز"}
      </button>
    </form>
  );
}
