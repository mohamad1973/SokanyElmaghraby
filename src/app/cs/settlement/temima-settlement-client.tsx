"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cairoTodayYmd } from "@/lib/cs/order-window";

type Disposition = "collect" | "return" | "postpone";

type SheetRow = {
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

type OrderHit = {
  id: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
};

const money = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Math.round(n));

function rowMatchesQuery(row: SheetRow, raw: string) {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.wooOrderNumber, row.customerName, row.productNames, row.phone, row.address].filter(Boolean).join(" ").toLowerCase();
  if (hay.includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4) {
    const phone = (row.phone || "").replace(/\D/g, "");
    if (phone.includes(digits) || phone.slice(-10).includes(digits.slice(-10))) return true;
    if (String(row.wooOrderNumber).replace(/\D/g, "").includes(digits)) return true;
  }
  return false;
}

function rowRemainder(row: SheetRow) {
  return Math.max(0, Number(row.cashAmount) || 0);
}

function shipmentValue(row: SheetRow) {
  return Math.max(0, Number(row.orderTotal) || 0);
}

function postponeValue(row: SheetRow) {
  return row.disposition === "postpone" ? rowRemainder(row) : 0;
}

function refusalValue(row: SheetRow) {
  return row.disposition === "return" ? rowRemainder(row) : 0;
}

function netValue(row: SheetRow) {
  return row.disposition === "collect" ? rowRemainder(row) : 0;
}

export function TemimaSettlementClient({
  canEdit,
  canEditDeposit = false,
}: {
  canEdit: boolean;
  canEditDeposit?: boolean;
}) {
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [closedCashDue, setClosedCashDue] = useState<number | null>(null);
  const [cashPaid, setCashPaid] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [closeDate, setCloseDate] = useState(cairoTodayYmd());
  const [shippingPaid, setShippingPaid] = useState(0);
  const [month, setMonth] = useState<MonthPreview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"week" | "orders">("week");
  const [orderHits, setOrderHits] = useState<OrderHit[]>([]);
  const [searchingOrders, setSearchingOrders] = useState(false);
  const searchSeq = useRef(0);

  const load = useCallback(async (week?: string, end?: string, monthDate?: string) => {
    const qs = new URLSearchParams();
    if (week) qs.set("week", week);
    if (end) qs.set("weekEnd", end);
    if (monthDate) qs.set("closeDate", monthDate);
    const res = await fetch(`/api/cs/settlement/temima?${qs}`);
    const data = (await res.json()) as {
      message?: string;
      weekStart?: string;
      weekEnd?: string;
      status?: "open" | "closed";
      rows?: SheetRow[];
      cashPaid?: number;
      cashDue?: number;
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
    setClosedCashDue(data.status === "closed" ? Number(data.cashDue) || 0 : null);
    setCashPaid(data.cashPaid || 0);
    setHistory(data.history || []);
    setMonth(data.month || null);
  }, []);

  useEffect(() => {
    void load(undefined, undefined, closeDate);
  }, [load, closeDate]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (searchScope !== "orders" || query.length < 2) {
      setOrderHits([]);
      setSearchingOrders(false);
      return;
    }
    setSearchingOrders(true);
    const seq = searchSeq.current + 1;
    searchSeq.current = seq;
    const handle = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(`/api/cs/settlement/temima?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { message?: string; matches?: OrderHit[] };
        if (seq !== searchSeq.current) return;
        setSearchingOrders(false);
        if (!res.ok) {
          setOrderHits([]);
          setMessage(data.message || "تعذر البحث في الأوردرات.");
          return;
        }
        setOrderHits(data.matches || []);
      })();
    }, 350);
    return () => window.clearTimeout(handle);
  }, [searchQuery, searchScope]);

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return rows;
    if (searchScope === "week") return rows.filter((row) => rowMatchesQuery(row, query));
    if (!orderHits.length) return rows;
    const ids = new Set(orderHits.map((hit) => hit.id));
    const inWeek = rows.filter((row) => ids.has(row.confirmationId));
    return inWeek.length ? inWeek : rows;
  }, [rows, searchQuery, searchScope, orderHits]);

  const outsideHits = useMemo(() => {
    if (searchScope !== "orders" || searchQuery.trim().length < 2) return [];
    const ids = new Set(rows.map((row) => row.confirmationId));
    return orderHits.filter((hit) => !ids.has(hit.id));
  }, [orderHits, rows, searchQuery, searchScope]);

  const shipmentTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (row.carried ? 0 : shipmentValue(row)), 0),
    [rows],
  );
  const depositTotal = useMemo(() => rows.reduce((sum, row) => sum + (row.depositAmount || 0), 0), [rows]);
  const postponeTotal = useMemo(() => rows.reduce((sum, row) => sum + postponeValue(row), 0), [rows]);
  const refusalTotal = useMemo(() => rows.reduce((sum, row) => sum + refusalValue(row), 0), [rows]);
  const netTotal = useMemo(() => rows.reduce((sum, row) => sum + netValue(row), 0), [rows]);
  const cashDue = closedCashDue == null ? netTotal : closedCashDue;
  const locked = !canEdit || status === "closed";

  function patchRow(id: number, patch: Partial<SheetRow>) {
    setRows((prev) => prev.map((row) => (row.confirmationId === id ? { ...row, ...patch } : row)));
  }

  async function saveFawryDeposit(row: SheetRow) {
    if (!canEditDeposit || status === "closed" || !row.fawry) return;
    const res = await fetch("/api/cs/settlement/temima", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fawry-deposit",
        confirmationId: row.confirmationId,
        amount: row.depositAmount,
      }),
    });
    const data = (await res.json()) as { message?: string };
    if (!res.ok) {
      setMessage(data.message || "تعذر حفظ ديبوزت فوري.");
      await load(weekStart, weekEnd, closeDate);
      return;
    }
    setMessage("اتحفظ ديبوزت فوري.");
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
          : { action, weekStart, weekEnd, cashPaid, rows },
      ),
    });
    const data = (await res.json()) as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر الحفظ.");
      return;
    }
    setMessage(action === "close-week" ? "تم قفل الأسبوع." : action === "close-month" ? "تم قفل الشهر." : "تم الحفظ.");
    await load(weekStart, weekEnd, closeDate);
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-[#14213D]">تصفية سيد تميمة</h1>
        <p className="text-sm font-bold text-[#14213D]/70">
          {canEdit ? "تسجيل التصفية من حساب الأدمن أو الشحن." : "متابعة فقط — التسجيل من حساب الأدمن أو الشحن."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <label className="text-xs font-bold text-[#14213D]">
          أسبوع من
          <input
            type="date"
            value={weekStart}
            onChange={(e) => void load(e.target.value, weekEnd, closeDate)}
            className="mr-2 h-9 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-xs font-bold"
          />
        </label>
        <label className="text-xs font-bold text-[#14213D]">
          إلى
          <input
            type="date"
            value={weekEnd}
            disabled={status === "closed"}
            onChange={(e) => void load(weekStart, e.target.value, closeDate)}
            className="mr-2 h-9 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-xs font-bold"
          />
        </label>
        <span className="text-xs font-bold text-[#14213D]/70">{status === "closed" ? "مقفل" : "مفتوح"}</span>
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="بحث: موبايل، اسم، عنوان، منتج..."
            className="h-9 min-w-[16rem] flex-1 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-3 text-sm font-bold"
          />
          <button
            type="button"
            onClick={() => setSearchScope("week")}
            className={`h-9 rounded-lg px-3 text-xs font-extrabold ${searchScope === "week" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"}`}
          >
            هذا الأسبوع
          </button>
          <button
            type="button"
            onClick={() => setSearchScope("orders")}
            className={`h-9 rounded-lg px-3 text-xs font-extrabold ${searchScope === "orders" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"}`}
          >
            كل الأوردرات
          </button>
        </div>
        {searchScope === "orders" && searchQuery.trim().length >= 2 ? (
          <div className="text-xs font-bold text-[#14213D]/80">
            {searchingOrders ? "جاري البحث..." : outsideHits.length ? "أوردرات خارج هذا الأسبوع:" : "مفيش أوردرات خارج هذا الأسبوع."}
            {outsideHits.length ? (
              <ul className="mt-1 space-y-1">
                {outsideHits.map((hit) => (
                  <li key={hit.id}>
                    <span dir="ltr">{hit.wooOrderNumber}</span>
                    {hit.customerName ? ` · ${hit.customerName}` : ""}
                    {hit.phone ? ` · ${hit.phone}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full text-sm">
          <thead className="bg-[#E5E5E5] text-right">
            <tr>
              <th className="px-2 py-2">أوردر</th>
              <th className="px-2 py-2">العميل</th>
              <th className="px-2 py-2">المنتج</th>
              <th className="px-2 py-2">قيمة الشحنات</th>
              <th className="px-2 py-2">ديبوزت</th>
              <th className="px-2 py-2">المؤجل</th>
              <th className="px-2 py-2">الرفض</th>
              <th className="px-2 py-2">الصافي</th>
              <th className="px-2 py-2">الحالة</th>
              <th className="px-2 py-2">كبير</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center font-bold text-[#14213D]/60">
                  {rows.length ? "لا توجد نتيجة في هذا الأسبوع." : "لا توجد أوردرات لهذا الأسبوع."}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={`${row.confirmationId}-${row.postponeLineId || 0}`} className="border-t border-[#E5E5E5]">
                  <td className="px-2 py-2 font-extrabold" dir="ltr">
                    {row.wooOrderNumber}
                    {row.carried ? <span className="mr-1 text-[10px] text-amber-700">مؤجل سابق</span> : null}
                  </td>
                  <td className="px-2 py-2">{row.customerName}</td>
                  <td className="px-2 py-2">{row.productNames || "—"}</td>
                  <td className="px-2 py-2">{row.carried ? "" : money(shipmentValue(row))}</td>
                  <td className="px-2 py-2">
                    {row.fawry && canEditDeposit && status !== "closed" ? (
                      <input
                        type="number"
                        min={0}
                        value={row.depositAmount}
                        onChange={(event) => {
                          const next = event.target.value.trim() === "" ? 0 : Number(event.target.value);
                          const deposit = Number.isFinite(next) ? Math.max(0, next) : 0;
                          const capped = Math.min(row.orderTotal || deposit, deposit);
                          patchRow(row.confirmationId, {
                            depositAmount: capped,
                            cashAmount: Math.max(0, (row.orderTotal || 0) - capped),
                          });
                        }}
                        onBlur={(event) => {
                          const next = event.target.value.trim() === "" ? 0 : Number(event.target.value);
                          const deposit = Number.isFinite(next) ? Math.min(row.orderTotal || 0, Math.max(0, next)) : 0;
                          const nextRow = {
                            ...row,
                            depositAmount: deposit,
                            cashAmount: Math.max(0, (row.orderTotal || 0) - deposit),
                          };
                          patchRow(row.confirmationId, {
                            depositAmount: nextRow.depositAmount,
                            cashAmount: nextRow.cashAmount,
                          });
                          void saveFawryDeposit(nextRow);
                        }}
                        className="h-8 w-24 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-xs font-bold"
                      />
                    ) : row.depositAmount ? (
                      money(row.depositAmount)
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="px-2 py-2">{postponeValue(row) ? money(postponeValue(row)) : ""}</td>
                  <td className="px-2 py-2">{refusalValue(row) ? money(refusalValue(row)) : ""}</td>
                  <td className="px-2 py-2">{netValue(row) ? money(netValue(row)) : ""}</td>
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
          {rows.length ? (
            <tfoot className="bg-[#14213D] text-white">
              <tr>
                <td className="px-2 py-2 font-extrabold" colSpan={3}>
                  المجموع
                </td>
                <td className="px-2 py-2 font-extrabold">{money(shipmentTotal)}</td>
                <td className="px-2 py-2 font-extrabold">{money(depositTotal)}</td>
                <td className="px-2 py-2 font-extrabold">{money(postponeTotal)}</td>
                <td className="px-2 py-2 font-extrabold">{money(refusalTotal)}</td>
                <td className="px-2 py-2 font-extrabold">{money(netTotal)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10 sm:grid-cols-2 lg:grid-cols-4">
        <p className="text-sm font-extrabold text-[#14213D]">قيمة الشحنات: {money(shipmentTotal)} ج</p>
        <p className="text-sm font-extrabold text-[#14213D]">الديبوزت: {money(depositTotal)} ج</p>
        <p className="text-sm font-extrabold text-[#14213D]">المؤجل: {money(postponeTotal)} ج</p>
        <p className="text-sm font-extrabold text-[#14213D]">الرفض: {money(refusalTotal)} ج</p>
        <p className="text-sm font-extrabold text-[#14213D]">الصافي المستحق: {money(cashDue)} ج</p>
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
