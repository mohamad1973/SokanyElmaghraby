"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type BostaRow = {
  trackingNumber: string;
  confirmationId: number | null;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  statusLabel: string;
  receivedTime: string;
};

type TemimaRow = {
  confirmationId: number;
  sheetSerial: number | null;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
};

type Payload = {
  day: string;
  bosta: { rows: BostaRow[]; error: string | null };
  temima: { rows: TemimaRow[] };
};

function OrderLink({ id, number }: { id: number | null; number: string }) {
  if (!number) return <span>—</span>;
  if (!id) return <span>{number}</span>;
  return (
    <Link href={`/cs/orders/${id}`} className="font-extrabold text-[#14213D] underline">
      {number}
    </Link>
  );
}

export function MaintenanceClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns", { cache: "no-store" });
      const body = (await response.json()) as Payload & { message?: string };
      if (!response.ok) {
        setError(body.message || "تعذر تحميل المرتجعات.");
        return;
      }
      setData(body);
    } catch {
      setError("تعذر تحميل المرتجعات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex gap-2 text-sm font-extrabold">
            <span className="rounded-full bg-[#14213D] px-3 py-1 text-white">المرتجعات</span>
          </div>
          <p className="mt-2 text-sm font-bold text-[#14213D]/70">يوم {data?.day || "…"}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-full bg-[#E6B325] px-4 py-2 text-sm font-extrabold text-black disabled:opacity-60"
        >
          {loading ? "جارٍ التحديث…" : "تحديث"}
        </button>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/10">
          <header className="flex items-center justify-between gap-2 border-b border-black/10 px-4 py-3">
            <h2 className="text-base font-extrabold text-[#14213D]">مرتجعات بوسطة</h2>
            <span className="text-xs font-bold text-[#14213D]/60">{data?.bosta.rows.length ?? 0}</span>
          </header>
          {data?.bosta.error ? <p className="px-4 py-3 text-sm font-bold text-red-700">{data.bosta.error}</p> : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="bg-[#F5F5F0] text-xs font-extrabold text-[#14213D]">
                <tr>
                  <th className="px-3 py-2">البوليصة</th>
                  <th className="px-3 py-2">الأوردر</th>
                  <th className="px-3 py-2">العميل</th>
                  <th className="px-3 py-2">الموبايل</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">الاستلام</th>
                </tr>
              </thead>
              <tbody>
                {data?.bosta.rows.length ? (
                  data.bosta.rows.map((row) => (
                    <tr key={row.trackingNumber} className="border-t border-black/5">
                      <td className="px-3 py-2 font-bold">{row.trackingNumber}</td>
                      <td className="px-3 py-2">
                        <OrderLink id={row.confirmationId} number={row.wooOrderNumber} />
                      </td>
                      <td className="px-3 py-2">{row.customerName || "—"}</td>
                      <td className="px-3 py-2">{row.phone || "—"}</td>
                      <td className="px-3 py-2">{row.statusLabel}</td>
                      <td className="px-3 py-2">{row.receivedTime || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center font-bold text-[#14213D]/60">
                      {loading ? "جارٍ جلب مرتجعات بوسطة…" : "مفيش مرتجعات مستلمة النهاردة."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/10">
          <header className="flex items-center justify-between gap-2 border-b border-black/10 px-4 py-3">
            <h2 className="text-base font-extrabold text-[#14213D]">مرتجعات سيد تميمة</h2>
            <span className="text-xs font-bold text-[#14213D]/60">{data?.temima.rows.length ?? 0}</span>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="bg-[#F5F5F0] text-xs font-extrabold text-[#14213D]">
                <tr>
                  <th className="px-3 py-2">المسلسل</th>
                  <th className="px-3 py-2">الأوردر</th>
                  <th className="px-3 py-2">العميل</th>
                  <th className="px-3 py-2">الموبايل</th>
                  <th className="px-3 py-2">المنتج</th>
                </tr>
              </thead>
              <tbody>
                {data?.temima.rows.length ? (
                  data.temima.rows.map((row) => (
                    <tr key={row.confirmationId} className="border-t border-black/5">
                      <td className="px-3 py-2">{row.sheetSerial ?? "—"}</td>
                      <td className="px-3 py-2">
                        <OrderLink id={row.confirmationId} number={row.wooOrderNumber} />
                      </td>
                      <td className="px-3 py-2">{row.customerName || "—"}</td>
                      <td className="px-3 py-2">{row.phone || "—"}</td>
                      <td className="px-3 py-2">{row.product || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center font-bold text-[#14213D]/60">
                      {loading ? "جارٍ جلب مرتجعات سيد تميمة…" : "مفيش إلغاء على شيت النهاردة."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
