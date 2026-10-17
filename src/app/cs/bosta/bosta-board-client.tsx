"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Row = {
  id: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  product: string;
  trackingNumber: string;
  waybillPrinted: boolean;
  handedToCarrier: boolean;
  bostaStatus: string;
  bostaStatusLabel: string;
  confirmedAt: string;
};

type Payload = { from: string; to: string; rows: Row[] };

export function BostaBoardClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (range?: { from: string; to: string }) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (range?.from) params.set("from", range.from);
      if (range?.to) params.set("to", range.to);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/api/cs/bosta-board${suffix}`, { cache: "no-store" });
      const body = (await response.json()) as Payload & { message?: string };
      if (!response.ok) {
        setError(body.message || "تعذر تحميل لوحة بوسطة.");
        return;
      }
      setData(body);
      setFrom(body.from);
      setTo(body.to);
    } catch {
      setError("تعذر تحميل لوحة بوسطة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load({ from, to });
  }

  async function saveRow(id: number) {
    setSavingId(id);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/cs/bosta-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId: id }),
      });
      const body = (await response.json()) as { message?: string; handedToCarrier?: boolean };
      if (!response.ok) {
        setError(body.message || "تعذر الحفظ.");
        return;
      }
      setNotice(body.message || "اتحفظ.");
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          rows: current.rows.map((row) => (row.id === id ? { ...row, handedToCarrier: true } : row)),
        };
      });
    } catch {
      setError("تعذر الحفظ.");
    } finally {
      setSavingId(0);
    }
  }

  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const rows = (data?.rows || []).filter((row) => {
    if (pendingOnly && row.handedToCarrier) return false;
    if (!q) return true;
    const hay = [
      row.wooOrderNumber,
      row.customerName,
      row.phone,
      row.trackingNumber,
      row.governorate,
      row.area,
      row.address,
      row.product,
      row.bostaStatusLabel,
    ]
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) return true;
    return digits.length >= 4 && hay.replace(/\D/g, "").includes(digits);
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-[#14213D]">لوحة بوسطة</h1>
          <p className="text-xs font-bold text-[#14213D]/70">
            احفظ من الصف من غير فتح الأوردر. افتح الأوردر فقط لو هتعدّل العنوان أو المحافظة أو المنطقة.
          </p>
        </div>
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-extrabold text-[#14213D]">
            من
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="text-xs font-extrabold text-[#14213D]">
            إلى
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="min-w-48 flex-1 text-xs font-extrabold text-[#14213D]">
            بحث
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="أوردر أو تليفون أو تراك"
              className="mt-1 block w-full rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-xs font-extrabold text-[#14213D]">
            <input type="checkbox" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} />
            اللي لسه متحفظتش
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-[#E6B325] px-4 py-2 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جارٍ البحث…" : "بحث"}
          </button>
        </form>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{notice}</p> : null}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/10">
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead className="bg-[#F5F5F0] text-xs font-extrabold text-[#14213D]">
              <tr>
                <th className="px-3 py-2">الأوردر</th>
                <th className="px-3 py-2">العميل</th>
                <th className="px-3 py-2">الموبايل</th>
                <th className="px-3 py-2">المحافظة / المنطقة</th>
                <th className="px-3 py-2">المنتج</th>
                <th className="px-3 py-2">البوليصة</th>
                <th className="px-3 py-2">حالة بوسطة</th>
                <th className="px-3 py-2">حفظ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-black/5">
                    <td className="px-3 py-2 font-extrabold">{row.wooOrderNumber}</td>
                    <td className="px-3 py-2">{row.customerName || "—"}</td>
                    <td className="px-3 py-2" dir="ltr">
                      {row.phone || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-bold">{[row.governorate, row.area].filter(Boolean).join(" · ") || "—"}</p>
                      <Link
                        href={`/cs/orders/${row.id}`}
                        className="text-xs font-extrabold text-[#14213D] underline"
                      >
                        تعديل العنوان
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2">{row.product || "—"}</td>
                    <td className="px-3 py-2">
                      <p className="font-bold" dir="ltr">
                        {row.trackingNumber || "—"}
                      </p>
                      <p className="text-[11px] font-bold text-[#14213D]/60">
                        {row.waybillPrinted ? "مطبوع" : "مش مطبوع"}
                      </p>
                    </td>
                    <td className="px-3 py-2">{row.bostaStatusLabel}</td>
                    <td className="px-3 py-2">
                      {row.handedToCarrier ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900">
                          محفوظ
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={savingId === row.id}
                          onClick={() => void saveRow(row.id)}
                          className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-60"
                        >
                          {savingId === row.id ? "جارٍ الحفظ…" : "حفظ"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center font-bold text-[#14213D]/60">
                    {loading ? "جارٍ التحميل…" : "مفيش أوردرات بوسطة في المدى."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
