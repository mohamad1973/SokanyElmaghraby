"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { cairoTodayYmd } from "@/lib/cs/order-window";

type OrderRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  transferDay: string;
  saved: boolean;
  cancelled: boolean;
  postponed: boolean;
  hasNotes: boolean;
  callHour: number | null;
};

type AgentBlock = {
  agentId: number;
  agentName: string;
  transferDay: string;
  transferredCount: number;
  calledCount: number;
  orders: OrderRow[];
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

function mark(on: boolean) {
  return on ? "✓" : "";
}

export function HomeConfirmReportClient() {
  const [dateFrom, setDateFrom] = useState(cairoTodayYmd());
  const [dateTo, setDateTo] = useState(cairoTodayYmd());
  const [agents, setAgents] = useState<AgentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setMessage("");
    const qs = new URLSearchParams({ from, to });
    try {
      const res = await fetch(`/api/cs/home-confirm-report?${qs}`);
      const data = (await res.json()) as {
        message?: string;
        dateFrom?: string;
        dateTo?: string;
        agents?: AgentBlock[];
      };
      if (!res.ok) {
        setMessage(data.message || "تعذر التحميل.");
        setAgents([]);
        setLoading(false);
        return;
      }
      if (data.dateFrom) setDateFrom(data.dateFrom);
      if (data.dateTo) setDateTo(data.dateTo);
      setAgents(data.agents || []);
    } catch {
      setMessage("تعذر التحميل.");
      setAgents([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(cairoTodayYmd(), cairoTodayYmd());
  }, [load]);

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-[#14213D]">تقرير تأكيدات منزل</h1>
        <p className="text-sm font-bold text-[#14213D]/70">
          لكل موظفة: تاريخ التحويل، عدد المحوّل والمكلَّم، وحالة كل أوردر (محفوظ / ملغى / مؤجل / ملاحظات / ساعة الاتصال من التطبيق).
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
              void load(next, dateTo);
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
              void load(dateFrom, next);
            }}
            className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-9 rounded-lg bg-[#14213D] px-3 text-xs font-extrabold text-white"
        >
          طباعة
        </button>
      </div>

      {loading ? <p className="text-sm font-bold text-[#14213D]/70">جاري التحميل...</p> : null}
      {message ? <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p> : null}

      {!loading && !agents.length && !message ? (
        <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70 shadow ring-1 ring-[#14213D]/10">
          مفيش أوردرات تأكيدات منزل في الفترة دي.
        </p>
      ) : null}

      <div className="space-y-4 print-target">
        {agents.map((block) => (
          <section
            key={`${block.agentId}-${block.transferDay}`}
            className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#14213D] px-4 py-3 text-white">
              <p className="text-sm font-extrabold">
                {block.agentName}
                <span className="mr-2 text-xs font-bold text-white/80">
                  · تاريخ التحويل {formatDayAr(block.transferDay)}
                </span>
              </p>
              <p className="text-xs font-bold">
                اتحوّل {block.transferredCount} · كلّم {block.calledCount}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#E5E5E5] text-right text-[#14213D]">
                    <th className="border border-[#14213D]/15 px-2 py-2">أوردر</th>
                    <th className="border border-[#14213D]/15 px-2 py-2">العميل</th>
                    <th className="border border-[#14213D]/15 px-2 py-2">محفوظ</th>
                    <th className="border border-[#14213D]/15 px-2 py-2">ملغى</th>
                    <th className="border border-[#14213D]/15 px-2 py-2">مؤجل</th>
                    <th className="border border-[#14213D]/15 px-2 py-2">ملاحظات</th>
                    <th className="border border-[#14213D]/15 px-2 py-2">ساعة المكالمة</th>
                  </tr>
                </thead>
                <tbody>
                  {block.orders.map((row) => (
                    <tr key={row.confirmationId}>
                      <td className="border border-[#14213D]/15 px-2 py-2 font-extrabold" dir="ltr">
                        <a href={`/cs/orders/${row.confirmationId}`} className="underline">
                          {row.wooOrderNumber}
                        </a>
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2">{row.customerName}</td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center font-extrabold text-emerald-700">
                        {mark(row.saved)}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center font-extrabold text-red-700">
                        {mark(row.cancelled)}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center font-extrabold text-amber-700">
                        {mark(row.postponed)}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center font-extrabold text-[#14213D]">
                        {mark(row.hasNotes)}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums" dir="ltr">
                        {row.callHour == null ? "" : String(row.callHour).padStart(2, "0")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
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
            position: absolute;
            inset: 0;
            padding: 8mm;
            background: white;
            color: black;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>
    </div>
  );
}
