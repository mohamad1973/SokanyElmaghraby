"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ZoneForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/dispatch/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        governorate: formData.get("governorate"),
      }),
    });

    const data = await response.json();
    setLoading(false);
    setMessage(data.message || (response.ok ? "تم إضافة المنطقة." : "تعذر الإضافة."));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-md border border-black/10 bg-white p-5 md:grid-cols-3">
      <label className="grid gap-1 text-sm font-bold">
        اسم المنطقة
        <input name="name" required placeholder="مدينة نصر" className="rounded border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm font-bold">
        المحافظة
        <select name="governorate" required className="rounded border px-3 py-2">
          <option value="القاهرة">القاهرة</option>
          <option value="الجيزة">الجيزة</option>
        </select>
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={loading} className="rounded bg-brand-gold px-4 py-2 text-sm font-bold text-black disabled:opacity-60">
          {loading ? "..." : "إضافة منطقة"}
        </button>
      </div>
      {message ? <p className="text-sm text-zinc-600 md:col-span-3">{message}</p> : null}
    </form>
  );
}
