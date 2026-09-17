"use client";

import { FormEvent, useState } from "react";

export function VendorRegisterForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/vendor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          teamSize: Number(payload.teamSize || 1),
          suggestedQuantity: Number(payload.suggestedQuantity || 0),
          suggestedRetailPrice: Number(payload.suggestedRetailPrice || 0) || undefined,
          suggestedGroupPrice: Number(payload.suggestedGroupPrice || 0),
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message || "تعذر التسجيل.");
        return;
      }
      setMessage(data.message || "تم التسجيل.");
      event.currentTarget.reset();
    } catch {
      setError("خطأ في الاتصال.");
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "mt-1 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-brand-gold";

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-[2rem] bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-zinc-950">تسجيل فيندور + أول منتج</h2>
      <p className="text-sm leading-7 text-zinc-600">
        بعد الموافقة يظهر عرضك كفرصة شراء جماعي على tooliano.com (واجهة سوكاني + منتجات Woo سوكاني).
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          اسم المستخدم
          <input name="username" required className={fieldClass} />
        </label>
        <label className="text-sm font-bold">
          كلمة المرور
          <input name="password" type="password" required minLength={6} className={fieldClass} />
        </label>
        <label className="text-sm font-bold">
          اسم الشركة
          <input name="companyName" required className={fieldClass} />
        </label>
        <label className="text-sm font-bold">
          المسؤول
          <input name="contactName" required className={fieldClass} />
        </label>
        <label className="text-sm font-bold">
          موبايل
          <input name="phone" required className={fieldClass} />
        </label>
        <label className="text-sm font-bold">
          إيميل
          <input name="contactEmail" type="email" required className={fieldClass} />
        </label>
      </div>

      <label className="block text-sm font-bold">
        العنوان
        <input name="address" required className={fieldClass} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          نوع النشاط
          <input name="businessType" defaultValue="توزيع" className={fieldClass} />
        </label>
        <label className="text-sm font-bold">
          حجم الفريق
          <input name="teamSize" type="number" min={1} defaultValue={1} className={fieldClass} />
        </label>
      </div>

      <hr className="border-black/5" />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          اسم المنتج
          <input name="productName" required className={fieldClass} />
        </label>
        <label className="text-sm font-bold">
          نوع المنتج
          <input name="productType" required className={fieldClass} />
        </label>
        <label className="text-sm font-bold">
          الكمية المستهدفة
          <input name="suggestedQuantity" type="number" min={1} required className={fieldClass} />
        </label>
        <label className="text-sm font-bold">
          سعر التجزئة
          <input name="suggestedRetailPrice" type="number" min={0} step="0.01" className={fieldClass} />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          سعر الشراء الجماعي
          <input name="suggestedGroupPrice" type="number" min={1} step="0.01" required className={fieldClass} />
        </label>
      </div>

      <label className="block text-sm font-bold">
        وصف المنتج
        <textarea name="productDescription" rows={4} className={fieldClass} />
      </label>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-brand-gold px-6 py-3 text-sm font-bold text-black disabled:opacity-60"
      >
        {loading ? "جاري الإرسال..." : "إرسال طلب الفيندور"}
      </button>
    </form>
  );
}
