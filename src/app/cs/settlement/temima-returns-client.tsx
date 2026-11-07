"use client";

import { useCallback, useEffect, useState } from "react";

type ReturnsRow = {
  confirmationId: number;
  wooOrderNumber: string;
  parentWooOrderNumber: string;
  sheetDay: string;
  customerName: string;
  phone: string;
  productNames: string;
  amount: number;
  caseKind: "temima_cancel" | "unmarked_prev_thu_sat" | "unmarked_curr_sun_wed" | "customer_return_exchange";
  temimaCancel: boolean;
  unmarkedPrevThuSat: boolean;
  unmarkedCurrSunWed: boolean;
  customerReturnExchange: boolean;
};

type Counts = {
  temimaCancel: number;
  unmarkedPrevThuSat: number;
  unmarkedCurrSunWed: number;
  customerReturnExchange: number;
  total: number;
};

const money = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Math.round(n));

const DATE_CONTROL =
  "h-9 min-w-[11rem] rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2.5 text-xs font-bold text-[#14213D] outline-none focus:border-[#FCA311]";

function openDateField(event: React.MouseEvent<HTMLDivElement>) {
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

function mark(on: boolean) {
  return on ? "✓" : "";
}

export function TemimaReturnsClient() {
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [rows, setRows] = useState<ReturnsRow[]>([]);
  const [counts, setCounts] = useState<Counts>({
    temimaCancel: 0,
    unmarkedPrevThuSat: 0,
    unmarkedCurrSunWed: 0,
    customerReturnExchange: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [prevThursday, setPrevThursday] = useState("");
  const [prevSaturday, setPrevSaturday] = useState("");
  const [currWednesday, setCurrWednesday] = useState("");

  const load = useCallback(async (week?: string) => {
    setLoading(true);
    setMessage("");
    const qs = new URLSearchParams();
    if (week) qs.set("week", week);
    try {
      const res = await fetch(`/api/cs/settlement/temima-returns?${qs}`);
      const data = (await res.json()) as {
        message?: string;
        weekStart?: string;
        weekEnd?: string;
        weekSaturday?: string;
        prevThursday?: string;
        prevSaturday?: string;
        currWednesday?: string;
        counts?: Counts;
        rows?: ReturnsRow[];
      };
      if (!res.ok) {
        setMessage(data.message || "تعذر التحميل.");
        setRows([]);
        setLoading(false);
        return;
      }
      if (data.weekStart) setWeekStart(data.weekStart);
      if (data.weekSaturday) setWeekEnd(data.weekSaturday);
      else if (data.weekEnd) setWeekEnd(data.weekEnd);
      setPrevThursday(data.prevThursday || "");
      setPrevSaturday(data.prevSaturday || "");
      setCurrWednesday(data.currWednesday || "");
      setCounts(
        data.counts || {
          temimaCancel: 0,
          unmarkedPrevThuSat: 0,
          unmarkedCurrSunWed: 0,
          customerReturnExchange: 0,
          total: 0,
        },
      );
      setRows(data.rows || []);
    } catch {
      setMessage("تعذر التحميل.");
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-[#14213D]">تقرير المرتجعات — سيد تميمة</h1>
        <p className="text-sm font-bold text-[#14213D]/70">
          عرض فقط — مفيش كتابة في الداتا. الغاء تميمة أي يوم · لم يسجل خميس/سبت السابق · لم يسجل أحد–أربعاء الحالي · استرجاع/استبدال العميل أي يوم.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <div className={`${DATE_CONTROL} cs-date-field flex cursor-pointer items-center gap-1.5`} onClick={openDateField}>
          <span className="pointer-events-none shrink-0 text-[#14213D]/60">أسبوع من</span>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => {
              const next = e.target.value;
              setWeekStart(next);
              void load(next);
            }}
            className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
          />
        </div>
        <span className="text-xs font-bold text-[#14213D]/70">
          إلى {weekEnd ? formatDayAr(weekEnd) : "—"}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-9 rounded-lg bg-[#14213D] px-3 text-xs font-extrabold text-white"
        >
          طباعة
        </button>
      </div>

      <div className="grid gap-2 rounded-2xl bg-white p-3 text-sm font-extrabold text-[#14213D] shadow ring-1 ring-[#14213D]/10 sm:grid-cols-2 lg:grid-cols-5">
        <p>الغاء تميمة: {counts.temimaCancel}</p>
        <p>
          لم يسجل خميس/سبت سابق
          {prevThursday && prevSaturday ? ` (${formatDayAr(prevThursday)} · ${formatDayAr(prevSaturday)})` : ""}:{" "}
          {counts.unmarkedPrevThuSat}
        </p>
        <p>
          لم يسجل أحد–أربعاء
          {weekStart && currWednesday ? ` (${formatDayAr(weekStart)} → ${formatDayAr(currWednesday)})` : ""}:{" "}
          {counts.unmarkedCurrSunWed}
        </p>
        <p>استرجاع/استبدال: {counts.customerReturnExchange}</p>
        <p>الإجمالي: {counts.total}</p>
      </div>

      <div className="max-h-[calc(100vh-8rem)] overflow-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">أوردر</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">الأصل</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">يوم الشيت</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">العميل</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">موبايل</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">المنتج</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">القيمة</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">الغاء تميمة</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">لم يسجل خميس/سبت سابق</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">لم يسجل أحد–أربعاء</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">استرجاع/استبدال</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">كارت</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="border border-[#14213D]/15 px-3 py-8 text-center font-bold text-[#14213D]/60">
                  {loading ? "جاري التحميل..." : message || "مفيش صفوف لهذا الأسبوع."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.confirmationId}-${row.caseKind}`}>
                  <td className="border border-[#14213D]/15 px-2 py-2 font-extrabold" dir="ltr">
                    {row.wooOrderNumber}
                  </td>
                  <td className="border border-[#14213D]/15 px-2 py-2" dir="ltr">
                    {row.parentWooOrderNumber || "—"}
                  </td>
                  <td className="border border-[#14213D]/15 px-2 py-2">
                    {row.sheetDay ? formatDayAr(row.sheetDay) : "—"}
                  </td>
                  <td className="border border-[#14213D]/15 px-2 py-2">{row.customerName}</td>
                  <td className="border border-[#14213D]/15 px-2 py-2" dir="ltr">
                    {row.phone || "—"}
                  </td>
                  <td className="border border-[#14213D]/15 px-2 py-2">{row.productNames}</td>
                  <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">
                    {money(row.amount)}
                  </td>
                  <td className="border border-[#14213D]/15 px-2 py-2 text-center font-extrabold text-red-700">
                    {mark(row.temimaCancel)}
                  </td>
                  <td className="border border-[#14213D]/15 px-2 py-2 text-center font-extrabold text-amber-800">
                    {mark(row.unmarkedPrevThuSat)}
                  </td>
                  <td className="border border-[#14213D]/15 px-2 py-2 text-center font-extrabold text-orange-700">
                    {mark(row.unmarkedCurrSunWed)}
                  </td>
                  <td className="border border-[#14213D]/15 px-2 py-2 text-center font-extrabold text-blue-800">
                    {mark(row.customerReturnExchange)}
                  </td>
                  <td className="border border-[#14213D]/15 px-2 py-2 text-center">
                    <a
                      href={`/cs/orders/${row.confirmationId}`}
                      className="text-xs font-extrabold text-[#14213D] underline"
                    >
                      فتح
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {message ? <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p> : null}

      <div className="print-only print-target hidden" dir="rtl">
        <h1 className="mb-2 text-center text-lg font-extrabold">
          تقرير المرتجعات من {formatDayAr(weekStart)} إلى {formatDayAr(weekEnd)}
        </h1>
        <p className="mb-2 text-center text-xs font-bold">
          الغاء {counts.temimaCancel} · خميس/سبت سابق {counts.unmarkedPrevThuSat} · أحد–أربعاء {counts.unmarkedCurrSunWed} ·
          استرجاع/استبدال {counts.customerReturnExchange} · إجمالي {counts.total}
        </p>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1">أوردر</th>
              <th className="border border-black px-1 py-1">الأصل</th>
              <th className="border border-black px-1 py-1">يوم</th>
              <th className="border border-black px-1 py-1">العميل</th>
              <th className="border border-black px-1 py-1">موبايل</th>
              <th className="border border-black px-1 py-1">المنتج</th>
              <th className="border border-black px-1 py-1">القيمة</th>
              <th className="border border-black px-1 py-1">الغاء</th>
              <th className="border border-black px-1 py-1">خ/س سابق</th>
              <th className="border border-black px-1 py-1">أحد–أربعاء</th>
              <th className="border border-black px-1 py-1">استرجاع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`print-${row.confirmationId}-${row.caseKind}`}>
                <td className="border border-black px-1 py-1" dir="ltr">
                  {row.wooOrderNumber}
                </td>
                <td className="border border-black px-1 py-1" dir="ltr">
                  {row.parentWooOrderNumber || ""}
                </td>
                <td className="border border-black px-1 py-1">{row.sheetDay ? formatDayAr(row.sheetDay) : ""}</td>
                <td className="border border-black px-1 py-1">{row.customerName}</td>
                <td className="border border-black px-1 py-1" dir="ltr">
                  {row.phone || ""}
                </td>
                <td className="border border-black px-1 py-1">{row.productNames}</td>
                <td className="border border-black px-1 py-1 text-center">{money(row.amount)}</td>
                <td className="border border-black px-1 py-1 text-center">{mark(row.temimaCancel)}</td>
                <td className="border border-black px-1 py-1 text-center">{mark(row.unmarkedPrevThuSat)}</td>
                <td className="border border-black px-1 py-1 text-center">{mark(row.unmarkedCurrSunWed)}</td>
                <td className="border border-black px-1 py-1 text-center">{mark(row.customerReturnExchange)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
            display: block !important;
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
