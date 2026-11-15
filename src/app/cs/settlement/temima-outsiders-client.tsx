"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type OutsideRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  productNames: string;
  phone: string;
  address: string;
  cashAmount: number;
  depositAmount: number;
  orderTotal: number;
  fawry: boolean;
  disposition: "collect" | "return" | "";
  isLarge: boolean;
  outsideReason?: string;
  naturalSheetDay?: string;
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

function dispositionLabel(row: OutsideRow) {
  if (row.disposition === "return") return "الغاء";
  if (row.disposition === "collect") return "تم بنجاح";
  return "فاضي · لم يسجل";
}

export function TemimaOutsidersClient({
  initialFrom,
  initialTo,
}: {
  initialFrom?: string;
  initialTo?: string;
}) {
  const [weekStart, setWeekStart] = useState(initialFrom || "");
  const [weekEnd, setWeekEnd] = useState(initialTo || "");
  const [rows, setRows] = useState<OutsideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const loadSeq = useRef(0);

  const load = useCallback(async (from?: string, to?: string) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("week", from);
    if (to) qs.set("weekEnd", to);
    let res: Response;
    try {
      res = await fetch(`/api/cs/settlement/temima?${qs}`);
    } catch {
      if (seq !== loadSeq.current) return;
      setMessage("تعذر التحميل.");
      setRows([]);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      message?: string;
      weekStart?: string;
      weekEnd?: string;
      outsideRows?: OutsideRow[];
    };
    if (seq !== loadSeq.current) return;
    if (!res.ok) {
      setMessage(data.message || "تعذر التحميل.");
      setRows([]);
      setLoading(false);
      return;
    }
    if (data.weekStart) setWeekStart(data.weekStart);
    if (data.weekEnd) setWeekEnd(data.weekEnd);
    setRows(data.outsideRows || []);
    setMessage("");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(initialFrom, initialTo);
  }, [load, initialFrom, initialTo]);

  const shipmentTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.orderTotal) || 0), 0),
    [rows],
  );
  const depositTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.depositAmount) || 0), 0),
    [rows],
  );

  const backHref =
    weekStart && weekEnd
      ? `/cs/settlement?week=${encodeURIComponent(weekStart)}&weekEnd=${encodeURIComponent(weekEnd)}`
      : "/cs/settlement";

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#14213D]">خارج الشيت الأصلي</h1>
          <p className="text-sm font-bold text-[#14213D]/70">
            أوردرات ظهرت في متابعة التصفية ومش أعضاء في شيت تميمة الأصلي لنفس المدى — مش متقحمين في بلوك اليوم.
          </p>
        </div>
        <Link
          href={backHref}
          className="h-9 rounded-lg bg-[#14213D] px-3 text-xs font-extrabold leading-9 text-white"
        >
          رجوع للتصفية
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <div className={`${DATE_CONTROL} cs-date-field flex cursor-pointer items-center gap-1.5`} onClick={openDateField}>
          <span className="pointer-events-none shrink-0 text-[#14213D]/60">من</span>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => {
              const next = e.target.value;
              setWeekStart(next);
              void load(next, weekEnd);
            }}
            className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
          />
        </div>
        <div className={`${DATE_CONTROL} cs-date-field flex cursor-pointer items-center gap-1.5`} onClick={openDateField}>
          <span className="pointer-events-none shrink-0 text-[#14213D]/60">إلى</span>
          <input
            type="date"
            value={weekEnd}
            onChange={(e) => {
              const next = e.target.value;
              setWeekEnd(next);
              void load(weekStart, next);
            }}
            className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
          />
        </div>
        <span className="text-xs font-extrabold text-[#14213D]">{loading ? "جاري التحميل..." : `${rows.length} أوردر`}</span>
      </div>

      {message ? <p className="text-sm font-bold text-red-700">{message}</p> : null}

      <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#14213D] text-white">
              <th className="border border-white/20 px-2 py-2">#</th>
              <th className="border border-white/20 px-2 py-2">أوردر</th>
              <th className="border border-white/20 px-2 py-2">العميل</th>
              <th className="border border-white/20 px-2 py-2">موبايل</th>
              <th className="border border-white/20 px-2 py-2">قيمة الشحنة</th>
              <th className="border border-white/20 px-2 py-2">ديبوزت</th>
              <th className="border border-white/20 px-2 py-2">الصافي</th>
              <th className="border border-white/20 px-2 py-2">الحالة</th>
              <th className="border border-white/20 px-2 py-2">يوم الشيت الطبيعي</th>
              <th className="border border-white/20 px-2 py-2">سبب الخروج عن الشيت</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={10} className="border border-[#14213D]/15 px-3 py-6 text-center font-bold text-[#14213D]/70">
                  مفيش أوردرات خارج الشيت الأصلي لهذا المدى.
                </td>
              </tr>
            ) : null}
            {rows.map((row, index) => (
              <tr key={row.confirmationId} className="odd:bg-[#F5F5F0]">
                <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">{index + 1}</td>
                <td className="border border-[#14213D]/15 px-2 py-2 font-extrabold" dir="ltr">
                  {row.wooOrderNumber}
                </td>
                <td className="border border-[#14213D]/15 px-2 py-2">{row.customerName}</td>
                <td className="border border-[#14213D]/15 px-2 py-2" dir="ltr">
                  {row.phone}
                </td>
                <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">{money(row.orderTotal)}</td>
                <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">{money(row.depositAmount)}</td>
                <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">{money(row.cashAmount)}</td>
                <td className="border border-[#14213D]/15 px-2 py-2 text-center">{dispositionLabel(row)}</td>
                <td className="border border-[#14213D]/15 px-2 py-2 text-center">
                  {row.naturalSheetDay ? formatDayAr(row.naturalSheetDay) : "—"}
                </td>
                <td className="border border-[#14213D]/15 px-2 py-2 font-bold text-[#7A1F1F]">
                  {row.outsideReason || "خارج عضوية الشيت الأصلي"}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length ? (
            <tfoot>
              <tr className="bg-[#14213D] text-white">
                <td colSpan={4} className="border border-white/20 px-2 py-2 font-extrabold">
                  إجمالي خارج الشيت
                </td>
                <td className="border border-white/20 px-2 py-2 text-center font-extrabold tabular-nums">
                  {money(shipmentTotal)}
                </td>
                <td className="border border-white/20 px-2 py-2 text-center font-extrabold tabular-nums">
                  {money(depositTotal)}
                </td>
                <td colSpan={4} className="border border-white/20 px-2 py-2" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
