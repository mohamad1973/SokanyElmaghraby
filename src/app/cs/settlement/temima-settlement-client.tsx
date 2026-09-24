"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { cairoTodayYmd } from "@/lib/cs/order-window";

type Disposition = "collect" | "return" | "postpone";

type SheetRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  cashAmount: number;
  disposition: Disposition;
  isLarge: boolean;
  carried: boolean;
  postponeLineId: number | null;
};

type HistoryRow = {
  weekStart: string;
  weekEnd: string;
  status: string;
  cashDue: number;
  cashPaid: number;
  inMonth: boolean;
};

type MonthPreview = {
  closeDate: string;
  weeks: Array<{ weekStart: string; weekEnd: string; cashPaid: number }>;
  deliveredOrders: number;
  shippingTotal: number;
};

const money = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Math.round(n));

export function TemimaSettlementClient({ canEdit }: { canEdit: boolean }) {
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [cashPaid, setCashPaid] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [closeDate, setCloseDate] = useState(cairoTodayYmd());
  const [shippingPaid, setShippingPaid] = useState(0);
  const [month, setMonth] = useState<MonthPreview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (week?: string, monthDate?: string) => {
    const qs = new URLSearchParams();
    if (week) qs.set("week", week);
    if (monthDate) qs.set("closeDate", monthDate);
    const res = await fetch(`/api/cs/settlement/temima?${qs}`);
    const data = (await res.json()) as {
      message?: string;
      weekStart?: string;
      weekEnd?: string;
      status?: "open" | "closed";
      rows?: SheetRow[];
      cashPaid?: number;
      history?: HistoryRow[];
      month?: MonthPreview | null;
    };
    if (!res.ok) {
      setMessage(data.message || "تعذر التحميل.");
      return;
    }
    setWeekStart(data.weekStart || "");
    setWeekEnd(data.weekEnd || "");
    setStatus(data.status || "open");
    setRows(data.rows || []);
    setCashPaid(data.cashPaid || 0);
    setHistory(data.history || []);
    setMonth(data.month || null);
  }, []);

  useEffect(() => {
    void load(undefined, closeDate);
  }, [load, closeDate]);

  const cashDue = useMemo(
    () => rows.filter((row) => row.disposition === "collect").reduce((sum, row) => sum + row.cashAmount, 0),
    [rows],
  );
  const locked = !canEdit || status === "closed";

  function patchRow(id: number, patch: Partial<SheetRow>) {
    setRows((prev) => prev.map((row) => (row.confirmationId === id ? { ...row, ...patch } : row)));
  }

  async function submit(action: "save" | "close-week" | "close-month") {
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/cs/settlement/temima", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "close-month"
          ? { action, closeDate, shippingPaid }
          : { action, weekStart, cashPaid, rows },
      ),
    });
    const data = (await res.json()) as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر الحفظ.");
      return;
    }
    setMessage(action === "close-week" ? "تم قفل الأسبوع." : action === "close-month" ? "تم قفل الشهر." : "تم الحفظ.");
    await load(weekStart, closeDate);
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-[#14213D]">تصفية سيد تميمة</h1>
        <p className="text-sm font-bold text-[#14213D]/70">
          {canEdit ? "تسجيل التصفية والحساب من حساب الشحن." : "متابعة فقط — التسجيل من يوزر حساب الشحن."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <label className="text-xs font-bold text-[#14213D]">
          أسبوع من
          <input
            type="date"
            value={weekStart}
            onChange={(e) => void load(e.target.value, closeDate)}
            className="mr-2 h-9 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-xs font-bold"
          />
        </label>
        <span className="text-xs font-bold text-[#14213D]/70">
          إلى {weekEnd || "—"} · {status === "closed" ? "مقفل" : "مفتوح"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full text-sm">
          <thead className="bg-[#E5E5E5] text-right">
            <tr>
              <th className="px-2 py-2">أوردر</th>
              <th className="px-2 py-2">العميل</th>
              <th className="px-2 py-2">النقد</th>
              <th className="px-2 py-2">الحالة</th>
              <th className="px-2 py-2">كبير</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center font-bold text-[#14213D]/60">
                  لا توجد أوردرات لهذا الأسبوع.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.confirmationId}-${row.postponeLineId || 0}`} className="border-t border-[#E5E5E5]">
                  <td className="px-2 py-2 font-extrabold" dir="ltr">
                    {row.wooOrderNumber}
                    {row.carried ? <span className="mr-1 text-[10px] text-amber-700">مؤجل سابق</span> : null}
                  </td>
                  <td className="px-2 py-2">{row.customerName}</td>
                  <td className="px-2 py-2">{money(row.cashAmount)}</td>
                  <td className="px-2 py-2">
                    <select
                      disabled={locked}
                      value={row.disposition}
                      onChange={(e) => patchRow(row.confirmationId, { disposition: e.target.value as Disposition })}
                      className="h-8 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-xs font-bold"
                    >
                      <option value="collect">{row.carried ? "تم التسليم" : "يُحصّل"}</option>
                      <option value="return">مرتجع</option>
                      <option value="postpone">مؤجل</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      disabled={locked || row.disposition !== "collect"}
                      checked={row.isLarge}
                      onChange={(e) => patchRow(row.confirmationId, { isLarge: e.target.checked })}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10 sm:grid-cols-3">
        <p className="text-sm font-extrabold text-[#14213D]">المستحق نقداً: {money(cashDue)} ج</p>
        <label className="text-sm font-bold">
          المدفوع من تميمة
          <input
            type="number"
            min={0}
            disabled={locked}
            value={cashPaid}
            onChange={(e) => setCashPaid(Number(e.target.value))}
            className="mt-1 h-9 w-full rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2"
          />
        </label>
        <p className="text-sm font-extrabold text-[#14213D]">المتبقي: {money(Math.max(0, cashDue - cashPaid))} ج</p>
        {canEdit && status !== "closed" ? (
          <div className="flex gap-2 sm:col-span-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void submit("save")}
              className="h-9 rounded-lg bg-[#E5E5E5] px-3 text-xs font-extrabold"
            >
              حفظ
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void submit("close-week")}
              className="h-9 rounded-lg bg-[#FCA311] px-3 text-xs font-extrabold"
            >
              قفل الأسبوع
            </button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
        <h2 className="text-lg font-extrabold text-[#14213D]">قفل الشهر</h2>
        <p className="text-xs font-bold text-[#14213D]/70">
          يجمع الأسابيع المقفلة التي لم تُقفل في شهر حتى التاريخ المختار. الشحن 75 ج، والكبير 100 ج.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-bold">
            تاريخ القفل
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="mt-1 block h-9 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2"
            />
          </label>
          <label className="text-sm font-bold">
            أجر الشحن المصروف
            <input
              type="number"
              min={0}
              disabled={!canEdit}
              value={shippingPaid}
              onChange={(e) => setShippingPaid(Number(e.target.value))}
              className="mt-1 block h-9 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2"
            />
          </label>
          {canEdit ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void submit("close-month")}
              className="h-9 rounded-lg bg-[#14213D] px-3 text-xs font-extrabold text-white"
            >
              قفل الشهر
            </button>
          ) : null}
        </div>
        {month ? (
          <p className="text-sm font-bold text-[#14213D]">
            {month.weeks.length} أسبوع · {month.deliveredOrders} أوردر مسلّم · شحن {money(month.shippingTotal)} ج
          </p>
        ) : null}
      </div>

      {history.length ? (
        <div className="rounded-2xl bg-white p-3 text-xs font-bold text-[#14213D]/80 shadow ring-1 ring-[#14213D]/10">
          {history.map((row) => (
            <p key={row.weekStart}>
              {row.weekStart} → {row.weekEnd}: {row.status === "closed" ? "مقفل" : "مفتوح"} · مدفوع {money(row.cashPaid)}{" "}
              {row.inMonth ? "· داخل شهر" : ""}
            </p>
          ))}
        </div>
      ) : null}

      {message ? <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p> : null}
    </div>
  );
}
