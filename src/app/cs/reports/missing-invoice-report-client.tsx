"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { cairoTodayYmd } from "@/lib/cs/order-window";

type ReportRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  shippingLabel: string;
  confirmedAt: string | null;
  confirmedDay: string;
  distributorName: string;
};

const DATE_CONTROL =
  "h-9 min-w-[11rem] rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2.5 text-xs font-bold text-[#14213D] outline-none focus:border-[#FCA311]";

function openDateField(event: MouseEvent<HTMLDivElement>) {
  const input = event.currentTarget.querySelector("input[type='date']");
  if (!(input instanceof HTMLInputElement)) return;
  input.focus();
  try {
    input.showPicker();
  } catch {
    // ignore
  }
}

function formatDayAr(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [year, month, day] = ymd.split("-");
  return `${Number(day)}-${Number(month)}-${year}`;
}

export function MissingInvoiceReportClient() {
  const [dateFrom, setDateFrom] = useState(cairoTodayYmd());
  const [dateTo, setDateTo] = useState(cairoTodayYmd());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setMessage("");
    const qs = new URLSearchParams({ from, to });
    try {
      const res = await fetch(`/api/cs/missing-invoice-report?${qs}`);
      const data = (await res.json()) as {
        message?: string;
        dateFrom?: string;
        dateTo?: string;
        count?: number;
        rows?: ReportRow[];
      };
      if (!res.ok) {
        setMessage(data.message || "تعذر التحميل.");
        setRows([]);
        setCount(0);
        setLoading(false);
        return;
      }
      if (data.dateFrom) setDateFrom(data.dateFrom);
      if (data.dateTo) setDateTo(data.dateTo);
      setRows(data.rows || []);
      setCount(typeof data.count === "number" ? data.count : (data.rows || []).length);
    } catch {
      setMessage("تعذر التحميل.");
      setRows([]);
      setCount(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(cairoTodayYmd(), cairoTodayYmd());
  }, [load]);

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-[#14213D]">بدون فاتورة</h1>
        <p className="text-sm font-bold text-[#14213D]/70">
          الأوردرات المحفوظة اللي مفيش عليها رقم فاتورة، حسب يوم الحفظ (توقيت القاهرة).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <div className={`${DATE_CONTROL} cs-date-field flex cursor-pointer items-center gap-1.5`} onClick={openDateField}>
          <span className="pointer-events-none shrink-0 text-[#14213D]/60">من</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              const next = e.target.value;
              setDateFrom(next);
            }}
            className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
          />
        </div>
        <div className={`${DATE_CONTROL} cs-date-field flex cursor-pointer items-center gap-1.5`} onClick={openDateField}>
          <span className="pointer-events-none shrink-0 text-[#14213D]/60">إلى</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              const next = e.target.value;
              setDateTo(next);
            }}
            className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void load(dateFrom, dateTo)}
          className="h-9 rounded-lg bg-[#FCA311] px-3 text-xs font-extrabold text-[#14213D]"
        >
          عرض
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-9 rounded-lg bg-[#14213D] px-3 text-xs font-extrabold text-white"
        >
          طباعة
        </button>
        {!loading ? (
          <p className="text-xs font-extrabold text-[#14213D]">العدد: {count}</p>
        ) : null}
      </div>

      {loading ? <p className="text-sm font-bold text-[#14213D]/70">جاري التحميل...</p> : null}
      {message ? <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p> : null}

      {!loading && !rows.length && !message ? (
        <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70 shadow ring-1 ring-[#14213D]/10">
          مفيش أوردرات محفوظة بدون فاتورة في الفترة دي.
        </p>
      ) : null}

      {rows.length ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10 print-target">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#E5E5E5] text-right text-[#14213D]">
                  <th className="border border-[#14213D]/15 px-2 py-2">أوردر</th>
                  <th className="border border-[#14213D]/15 px-2 py-2">العميل</th>
                  <th className="border border-[#14213D]/15 px-2 py-2">هاتف</th>
                  <th className="border border-[#14213D]/15 px-2 py-2">شحن</th>
                  <th className="border border-[#14213D]/15 px-2 py-2">تاريخ الحفظ</th>
                  <th className="border border-[#14213D]/15 px-2 py-2">الموزّع</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.confirmationId}>
                    <td className="border border-[#14213D]/15 px-2 py-2 font-extrabold" dir="ltr">
                      <Link href={`/cs/orders/${row.confirmationId}`} className="underline">
                        {row.wooOrderNumber}
                      </Link>
                    </td>
                    <td className="border border-[#14213D]/15 px-2 py-2">{row.customerName}</td>
                    <td className="border border-[#14213D]/15 px-2 py-2 tabular-nums" dir="ltr">
                      {row.phone || "—"}
                    </td>
                    <td className="border border-[#14213D]/15 px-2 py-2">{row.shippingLabel}</td>
                    <td className="border border-[#14213D]/15 px-2 py-2 tabular-nums" dir="ltr">
                      {formatDayAr(row.confirmedDay)}
                    </td>
                    <td className="border border-[#14213D]/15 px-2 py-2">{row.distributorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-target,
          .print-target * {
            visibility: visible !important;
          }
          .print-target {
            position: absolute;
            inset: 0;
            padding: 8mm;
            background: white;
            color: black;
          }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
        }
      `}</style>
    </div>
  );
}
