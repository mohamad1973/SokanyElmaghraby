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

type ReconcileReport = {
  from: string;
  to: string;
  counts: {
    warehouse: number;
    bostaPicked: number;
    matched: number;
    warehouseOnly: number;
    bostaOnly: number;
  };
  matched: Array<{
    confirmationId: number | null;
    wooOrderNumber: string;
    trackingNumber: string;
    invoiceNumber: string;
    invoiceNumberAt: string | null;
    warehouseSheetPrinted: boolean;
    customerName: string;
    phone: string;
    bostaStatusLabel: string;
    pickedUpAt: string;
  }>;
  warehouseOnly: Array<{
    id: number;
    wooOrderNumber: string;
    trackingNumber: string;
    invoiceNumber: string;
    invoiceNumberAt: string | null;
    warehouseSheetPrinted: boolean;
    customerName: string;
    phone: string;
  }>;
  bostaOnly: Array<{
    trackingNumber: string;
    statusLabel: string;
    customerName: string;
    phone: string;
    businessReference: string;
    pickedUpAt: string;
  }>;
  bostaError: string | null;
  message?: string;
};

type Tab = "board" | "reconcile";

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ar-EG");
}

export function BostaBoardClient({ initialTab = "board" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab === "reconcile" ? "reconcile" : "board");
  const [data, setData] = useState<Payload | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reconcile, setReconcile] = useState<ReconcileReport | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileError, setReconcileError] = useState("");
  const [reconcileBucket, setReconcileBucket] = useState<"matched" | "warehouseOnly" | "bostaOnly">("warehouseOnly");

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

  const loadReconcile = useCallback(async (range: { from: string; to: string }) => {
    setReconcileLoading(true);
    setReconcileError("");
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      const response = await fetch(`/api/cs/bosta-reconcile?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json()) as ReconcileReport;
      if (!response.ok) {
        setReconcileError(body.message || "تعذر تحميل مقارنة المخزن وبوسطة.");
        return;
      }
      setReconcile(body);
      setFrom(body.from);
      setTo(body.to);
      if (body.bostaError) setReconcileError(body.bostaError);
    } catch {
      setReconcileError("تعذر تحميل مقارنة المخزن وبوسطة.");
    } finally {
      setReconcileLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    if (tab === "reconcile") {
      void loadReconcile({ from, to });
      return;
    }
    void load({ from, to });
  }

  useEffect(() => {
    if (tab !== "reconcile") return;
    if (!from || !to) return;
    if (reconcile && reconcile.from === from && reconcile.to === to) return;
    void loadReconcile({ from, to });
  }, [tab, from, to, reconcile, loadReconcile]);

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
            للرقابة والمتابعة. الحفظ من داخل صفحة الأوردر — ومش لازم تعليم كل الكروت زي تميمة.
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
          {tab === "board" ? (
            <>
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
                اللي لسه متسلمتش للشحن
              </label>
            </>
          ) : null}
          <button
            type="submit"
            disabled={tab === "board" ? loading : reconcileLoading}
            className="rounded-full bg-[#E6B325] px-4 py-2 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {tab === "board"
              ? loading
                ? "جارٍ البحث…"
                : "بحث"
              : reconcileLoading
                ? "جارٍ المقارنة…"
                : "مقارنة"}
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("board")}
          className={`rounded-full px-4 py-2 text-xs font-extrabold ${
            tab === "board" ? "bg-[#14213D] text-white" : "bg-white text-[#14213D] ring-1 ring-black/10"
          }`}
        >
          المتابعة
        </button>
        <button
          type="button"
          onClick={() => setTab("reconcile")}
          className={`rounded-full px-4 py-2 text-xs font-extrabold ${
            tab === "reconcile" ? "bg-[#14213D] text-white" : "bg-white text-[#14213D] ring-1 ring-black/10"
          }`}
        >
          نزل المخزن ↔ استلام بوسطة
        </button>
      </div>

      {tab === "board" ? (
        <>
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
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
                    <th className="px-3 py-2">التسليم</th>
                    <th className="px-3 py-2">الأوردر</th>
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
                          {[row.governorate, row.area].filter(Boolean).join(" · ") || "—"}
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
                              اتسلّم
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">
                              لسه
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/cs/orders/${row.id}`}
                            className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white"
                          >
                            فتح للحفظ
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center font-bold text-[#14213D]/60">
                        {loading ? "جارٍ التحميل…" : "مفيش أوردرات بوسطة في المدى."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <p className="text-xs font-bold text-[#14213D]/70">
            مقارنة فواتير «نزل للمخزن» عندنا مع شحنات بوسطة اللي اتسجّل عليها وقت استلام فعلي (`pickedUpTime`) في نفس الفترة.
          </p>
          {reconcileError ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{reconcileError}</p>
          ) : null}
          {reconcile ? (
            <div className="grid gap-2 sm:grid-cols-5">
              {[
                { key: "warehouse", label: "نزل المخزن", value: reconcile.counts.warehouse },
                { key: "bostaPicked", label: "استلام بوسطة", value: reconcile.counts.bostaPicked },
                { key: "matched", label: "مطابق", value: reconcile.counts.matched, bucket: "matched" as const },
                {
                  key: "warehouseOnly",
                  label: "عندنا ومش عند بوسطة",
                  value: reconcile.counts.warehouseOnly,
                  bucket: "warehouseOnly" as const,
                },
                {
                  key: "bostaOnly",
                  label: "عند بوسطة ومش عندنا",
                  value: reconcile.counts.bostaOnly,
                  bucket: "bostaOnly" as const,
                },
              ].map((card) => (
                <button
                  key={card.key}
                  type="button"
                  disabled={!card.bucket}
                  onClick={() => card.bucket && setReconcileBucket(card.bucket)}
                  className={`rounded-2xl bg-white px-3 py-3 text-right shadow-sm ring-1 ${
                    card.bucket && reconcileBucket === card.bucket ? "ring-[#E6B325]" : "ring-black/10"
                  } disabled:cursor-default`}
                >
                  <p className="text-[11px] font-extrabold text-[#14213D]/70">{card.label}</p>
                  <p className="mt-1 text-xl font-extrabold text-[#14213D]">{card.value}</p>
                </button>
              ))}
            </div>
          ) : null}

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/10">
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-[#F5F5F0] text-xs font-extrabold text-[#14213D]">
                  <tr>
                    <th className="px-3 py-2">الأوردر</th>
                    <th className="px-3 py-2">العميل</th>
                    <th className="px-3 py-2">الموبايل</th>
                    <th className="px-3 py-2">الفاتورة</th>
                    <th className="px-3 py-2">التراك</th>
                    <th className="px-3 py-2">التوقيت</th>
                    <th className="px-3 py-2">الحالة</th>
                    <th className="px-3 py-2">فتح</th>
                  </tr>
                </thead>
                <tbody>
                  {reconcileLoading ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center font-bold text-[#14213D]/60">
                        جارٍ المقارنة مع بوسطة…
                      </td>
                    </tr>
                  ) : !reconcile ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center font-bold text-[#14213D]/60">
                        اختَر الفترة واضغط مقارنة.
                      </td>
                    </tr>
                  ) : reconcileBucket === "matched" ? (
                    reconcile.matched.length ? (
                      reconcile.matched.map((row) => (
                        <tr key={`${row.trackingNumber}-${row.wooOrderNumber}`} className="border-t border-black/5">
                          <td className="px-3 py-2 font-extrabold">{row.wooOrderNumber || "—"}</td>
                          <td className="px-3 py-2">{row.customerName || "—"}</td>
                          <td className="px-3 py-2" dir="ltr">
                            {row.phone || "—"}
                          </td>
                          <td className="px-3 py-2" dir="ltr">
                            {row.invoiceNumber || "—"}
                            <p className="text-[11px] font-bold text-[#14213D]/60">
                              {row.warehouseSheetPrinted ? "اتطبع التقرير" : "لم يطبع التقرير"}
                            </p>
                          </td>
                          <td className="px-3 py-2 font-bold" dir="ltr">
                            {row.trackingNumber || "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            فاتورة: {formatWhen(row.invoiceNumberAt)}
                            <br />
                            استلام: {formatWhen(row.pickedUpAt)}
                          </td>
                          <td className="px-3 py-2">{row.bostaStatusLabel || "—"}</td>
                          <td className="px-3 py-2">
                            {row.confirmationId ? (
                              <Link
                                href={`/cs/orders/${row.confirmationId}`}
                                className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white"
                              >
                                فتح
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center font-bold text-[#14213D]/60">
                          مفيش صفوف مطابقة في الفترة.
                        </td>
                      </tr>
                    )
                  ) : reconcileBucket === "warehouseOnly" ? (
                    reconcile.warehouseOnly.length ? (
                      reconcile.warehouseOnly.map((row) => (
                        <tr key={row.id} className="border-t border-black/5">
                          <td className="px-3 py-2 font-extrabold">{row.wooOrderNumber}</td>
                          <td className="px-3 py-2">{row.customerName || "—"}</td>
                          <td className="px-3 py-2" dir="ltr">
                            {row.phone || "—"}
                          </td>
                          <td className="px-3 py-2" dir="ltr">
                            {row.invoiceNumber || "—"}
                            <p className="text-[11px] font-bold text-[#14213D]/60">
                              {row.warehouseSheetPrinted ? "اتطبع التقرير" : "لم يطبع التقرير"}
                            </p>
                          </td>
                          <td className="px-3 py-2 font-bold" dir="ltr">
                            {row.trackingNumber || "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">فاتورة: {formatWhen(row.invoiceNumberAt)}</td>
                          <td className="px-3 py-2 text-amber-800">مش ظاهر في استلام بوسطة للفترة</td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/cs/orders/${row.id}`}
                              className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white"
                            >
                              فتح
                            </Link>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center font-bold text-[#14213D]/60">
                          مفيش أوردرات نزلت المخزن من غير استلام بوسطة.
                        </td>
                      </tr>
                    )
                  ) : reconcile.bostaOnly.length ? (
                    reconcile.bostaOnly.map((row) => (
                      <tr key={row.trackingNumber} className="border-t border-black/5">
                        <td className="px-3 py-2 font-extrabold">{row.businessReference || "—"}</td>
                        <td className="px-3 py-2">{row.customerName || "—"}</td>
                        <td className="px-3 py-2" dir="ltr">
                          {row.phone || "—"}
                        </td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2 font-bold" dir="ltr">
                          {row.trackingNumber}
                        </td>
                        <td className="px-3 py-2 text-xs">استلام: {formatWhen(row.pickedUpAt)}</td>
                        <td className="px-3 py-2">{row.statusLabel || "—"}</td>
                        <td className="px-3 py-2 text-[#14213D]/60">—</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center font-bold text-[#14213D]/60">
                        مفيش استلام بوسطة من غير فاتورة مخزن مطابقة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
