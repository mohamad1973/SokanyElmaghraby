"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cairoTodayYmd } from "@/lib/cs/order-window";
import { formatSayedSheetHeading } from "@/lib/cs/temima-sheet";

type Disposition = "collect" | "return" | "postpone" | "";

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
  sheetDay?: string;
  carryFromStart?: string;
  carryFromEnd?: string;
  refusalReason?: string;
};

type RefusalRow = {
  confirmationId: number;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  productNames: string;
  sheetDay: string;
  reason: string;
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
  const amount = Number(row.cashAmount);
  return Number.isFinite(amount) ? amount : 0;
}

function shipmentValue(row: SheetRow) {
  const amount = Number(row.orderTotal);
  return Number.isFinite(amount) ? amount : 0;
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

function shippingFee(row: SheetRow) {
  if (row.disposition !== "collect") return 0;
  return row.isLarge ? 100 : 75;
}

function orderNumber(row: SheetRow) {
  return Number(String(row.wooOrderNumber).replace(/\D/g, "")) || 0;
}

function formatDayAr(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [year, month, day] = ymd.split("-");
  return `${Number(day)}-${Number(month)}-${year}`;
}

function carryBlockTitle(from: string, to: string) {
  if (from && to) return `شيت مؤجلات مرحلة من أسبوع ${formatDayAr(from)} إلى ${formatDayAr(to)}`;
  return "شيت مؤجلات مرحلة";
}

type DayBlock = { key: string; title: string; rows: SheetRow[] };

function dayBlocksOf(visible: SheetRow[]): DayBlock[] {
  const byDay = new Map<string, SheetRow[]>();
  const undated: SheetRow[] = [];
  const carriedByWeek = new Map<string, SheetRow[]>();
  for (const row of visible) {
    if (row.carried) {
      const key = `${row.carryFromStart || ""}|${row.carryFromEnd || ""}`;
      const list = carriedByWeek.get(key) || [];
      list.push(row);
      carriedByWeek.set(key, list);
      continue;
    }
    if (!row.sheetDay) {
      undated.push(row);
      continue;
    }
    const list = byDay.get(row.sheetDay) || [];
    list.push(row);
    byDay.set(row.sheetDay, list);
  }
  const blocks: DayBlock[] = [...byDay.keys()]
    .sort()
    .map((day) => ({
      key: day,
      title: formatSayedSheetHeading(day),
      rows: (byDay.get(day) || []).sort((a, b) => orderNumber(b) - orderNumber(a)),
    }));
  if (undated.length) {
    blocks.push({
      key: "undated",
      title: "بدون يوم شيت",
      rows: undated.sort((a, b) => orderNumber(b) - orderNumber(a)),
    });
  }
  for (const key of [...carriedByWeek.keys()].sort()) {
    const carried = carriedByWeek.get(key) || [];
    const [from, to] = key.split("|");
    blocks.push({
      key: `carried-${key}`,
      title: carryBlockTitle(from, to),
      rows: carried.sort((a, b) => orderNumber(b) - orderNumber(a)),
    });
  }
  return blocks;
}

function sumOf(list: SheetRow[], pick: (row: SheetRow) => number) {
  return list.reduce((sum, row) => sum + pick(row), 0);
}

function dispositionLabel(row: SheetRow) {
  if (row.disposition === "return") return "الغاء";
  if (row.disposition === "postpone") return "مؤجل";
  if (row.disposition === "collect") return "تم بنجاح";
  return "";
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
  const [fullWeek, setFullWeek] = useState(false);
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [refusals, setRefusals] = useState<RefusalRow[]>([]);
  const [printKind, setPrintKind] = useState<"week" | "refusals">("week");
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
  const editedIds = useRef(new Set<number>());
  const largePending = useRef(new Set<string>());

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
      fullWeek?: boolean;
      status?: "open" | "closed";
      rows?: SheetRow[];
      refusals?: RefusalRow[];
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
    setFullWeek(data.fullWeek === true);
    setStatus(data.status || "open");
    editedIds.current.clear();
    setRows(data.rows || []);
    setRefusals(data.refusals || []);
    setClosedCashDue(data.status === "closed" && data.fullWeek ? Number(data.cashDue) || 0 : null);
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
  const dayBlocks = useMemo(() => dayBlocksOf(visibleRows), [visibleRows]);
  const serials = useMemo(() => {
    const map = new Map<string, number>();
    for (const block of dayBlocksOf(rows)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(block.key)) continue;
      block.rows.forEach((row, index) => {
        map.set(`${row.confirmationId}-${row.postponeLineId || 0}`, index + 1);
      });
    }
    return map;
  }, [rows]);

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
  const shippingTotal = useMemo(() => rows.reduce((sum, row) => sum + shippingFee(row), 0), [rows]);
  const weekCollectDue = useMemo(
    () => rows.reduce((sum, row) => sum + (row.carried ? 0 : netValue(row)), 0),
    [rows],
  );
  const priorPostponeCollectDue = useMemo(
    () => rows.reduce((sum, row) => sum + (row.carried ? netValue(row) : 0), 0),
    [rows],
  );
  const priorPostponeCollectedOrders = useMemo(
    () =>
      rows
        .filter((row) => row.carried && row.disposition === "collect")
        .map((row) => row.wooOrderNumber)
        .sort((a, b) => Number(String(b).replace(/\D/g, "")) - Number(String(a).replace(/\D/g, ""))),
    [rows],
  );
  const cashDue = closedCashDue == null ? netTotal : closedCashDue;
  const locked = !canEdit || status === "closed";

  function patchRow(id: number, patch: Partial<SheetRow>, edited = false) {
    if (edited) editedIds.current.add(id);
    setRows((prev) => prev.map((row) => (row.confirmationId === id ? { ...row, ...patch } : row)));
  }

  async function setLarge(row: SheetRow, isLarge: boolean) {
    if (locked) return;
    if (row.disposition !== "collect") {
      setMessage("كبير يتسجل مع تم بنجاح فقط.");
      return;
    }
    const lineKey = row.postponeLineId || 0;
    const pendingKey = `${row.confirmationId}:${lineKey}`;
    if (largePending.current.has(pendingKey)) return;
    largePending.current.add(pendingKey);
    setRows((prev) =>
      prev.map((item) =>
        item.confirmationId === row.confirmationId && (item.postponeLineId || 0) === lineKey ? { ...item, isLarge } : item,
      ),
    );
    try {
      const res = await fetch("/api/cs/settlement/temima", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "large", confirmationId: row.confirmationId, isLarge }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setRows((prev) =>
          prev.map((item) =>
            item.confirmationId === row.confirmationId && (item.postponeLineId || 0) === lineKey
              ? { ...item, isLarge: row.isLarge }
              : item,
          ),
        );
        setMessage(data.message || "تعذر حفظ كبير.");
        return;
      }
      setMessage(isLarge ? "اتسجل كبير." : "اتشال كبير.");
    } finally {
      largePending.current.delete(pendingKey);
    }
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
          : {
              action,
              weekStart,
              weekEnd,
              cashPaid,
              rows: rows.filter((row) => editedIds.current.has(row.confirmationId)),
            },
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
          {canEdit
            ? "المطلوب تحصيله من تعليم مشرف المناديب والأسبوع مفتوح. القائمة تعديل من الحسابات لو حابب."
            : "متابعة فقط. المطلوب تحصيله من تعليم مشرف المناديب."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <label className="text-xs font-bold text-[#14213D]">
          من
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
            onChange={(e) => void load(weekStart, e.target.value, closeDate)}
            className="mr-2 h-9 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-xs font-bold"
          />
        </label>
        <span className="text-xs font-bold text-[#14213D]/70">{status === "closed" ? "الأسبوع مقفل" : fullWeek ? "أسبوع كامل" : "فترة مفتوحة"}</span>
        <button
          type="button"
          onClick={() => {
            setPrintKind("week");
            window.setTimeout(() => window.print(), 50);
          }}
          className="h-9 rounded-lg bg-[#14213D] px-3 text-xs font-extrabold text-white"
        >
          طباعة
        </button>
        <button
          type="button"
          onClick={() => {
            setPrintKind("refusals");
            window.setTimeout(() => window.print(), 50);
          }}
          className="h-9 rounded-lg bg-red-700 px-3 text-xs font-extrabold text-white"
        >
          طباعة بيان المرفوض
        </button>
        {fullWeek ? null : (
          <p className="text-xs font-bold text-[#14213D]/70">قفل الأسبوع بالطلب، لما تختار من الأحد للسبت.</p>
        )}
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
            هذه الفترة
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

      <div className="max-h-[calc(100vh-8rem)] overflow-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="text-right">
            <tr>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">مسلسل</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">أوردر</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">العميل</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">موبايل</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">المنتج</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">قيمة الشحنات</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">ديبوزت</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">المؤجل</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">الرفض</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">الصافي</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">الحالة</th>
              <th className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">كبير</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="border border-[#14213D]/15 px-3 py-8 text-center font-bold text-[#14213D]/60">
                  {rows.length ? "لا توجد نتيجة في هذا الأسبوع." : "لا توجد أوردرات لهذا الأسبوع."}
                </td>
              </tr>
            ) : (
              dayBlocks.map((block) => (
                <Fragment key={block.key}>
                  <tr>
                    <td colSpan={12} className="border border-[#14213D]/25 bg-[#14213D] px-3 py-2 text-center text-sm font-extrabold text-white">
                      {block.title}
                    </td>
                  </tr>
                  {block.rows.map((row) => (
                    <tr key={`${row.confirmationId}-${row.postponeLineId || 0}`}>
                      <td className="border border-[#14213D]/25 px-2 py-2 text-center font-extrabold tabular-nums">
                        {serials.get(`${row.confirmationId}-${row.postponeLineId || 0}`) || ""}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2 font-extrabold" dir="ltr">
                        {row.wooOrderNumber}
                        {row.carried ? <span className="mr-1 text-[10px] text-amber-700">مؤجل سابق</span> : null}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2">{row.customerName}</td>
                      <td className="whitespace-nowrap border border-[#14213D]/15 px-2 py-2 tabular-nums" dir="ltr">
                        {row.phone || "—"}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2">{row.productNames || "—"}</td>
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {row.carried ? "" : money(shipmentValue(row))}
                      </td>
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {row.fawry && canEditDeposit && status !== "closed" ? (
                          <input
                            type="number"
                            min={0}
                            value={row.depositAmount}
                            onChange={(event) => {
                              const next = event.target.value.trim() === "" ? 0 : Number(event.target.value);
                              const deposit = Number.isFinite(next) ? Math.max(0, next) : 0;
                              const orderTotal = Number(row.orderTotal) || 0;
                              const capped = orderTotal < 0 ? 0 : Math.min(orderTotal || deposit, deposit);
                              patchRow(row.confirmationId, {
                                depositAmount: capped,
                                cashAmount: orderTotal < 0 ? orderTotal : Math.max(0, orderTotal - capped),
                              });
                            }}
                            onBlur={(event) => {
                              const next = event.target.value.trim() === "" ? 0 : Number(event.target.value);
                              const orderTotal = Number(row.orderTotal) || 0;
                              const deposit = orderTotal < 0 || !Number.isFinite(next) ? 0 : Math.min(orderTotal, Math.max(0, next));
                              const nextRow = {
                                ...row,
                                depositAmount: deposit,
                                cashAmount: orderTotal < 0 ? orderTotal : Math.max(0, orderTotal - deposit),
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
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {postponeValue(row) ? money(postponeValue(row)) : ""}
                      </td>
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {refusalValue(row) ? money(refusalValue(row)) : ""}
                      </td>
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {netValue(row) ? money(netValue(row)) : ""}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2">
                        <select
                          disabled={locked}
                          value={row.disposition}
                          onChange={(e) => patchRow(row.confirmationId, { disposition: e.target.value as Disposition }, true)}
                          className="h-8 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-xs font-bold"
                        >
                          <option value="">لم يُعلَّم</option>
                          <option value="collect">تم بنجاح</option>
                          <option value="return">الغاء</option>
                          <option value="postpone">مؤجل</option>
                        </select>
                      </td>
                      <td
                        className={`border border-[#14213D]/15 p-0 text-center ${locked ? "" : "cursor-pointer"}`}
                        onClick={() => {
                          if (locked) return;
                          void setLarge(row, !row.isLarge);
                        }}
                      >
                        <div className="flex min-h-10 items-center justify-center px-2 py-2">
                          <input
                            type="checkbox"
                            className="pointer-events-none size-5 accent-[#FCA311]"
                            tabIndex={-1}
                            readOnly
                            disabled={locked}
                            checked={row.isLarge}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} className="border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 font-extrabold text-[#14213D]">
                      {block.key === "carried" ? block.title : "تصفية اليوم"}
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {money(sumOf(block.rows, (row) => (row.carried ? 0 : shipmentValue(row))))}
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {money(sumOf(block.rows, (row) => row.depositAmount || 0))}
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {money(sumOf(block.rows, postponeValue))}
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {money(sumOf(block.rows, refusalValue))}
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {money(sumOf(block.rows, netValue))}
                    </td>
                    <td colSpan={2} className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums text-[#14213D]">
                      شحن اليوم {money(sumOf(block.rows, shippingFee))}
                    </td>
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>
          {rows.length ? (
            <tfoot>
              <tr>
                <td className="border border-[#14213D] bg-[#14213D] px-2 py-2 font-extrabold text-white" colSpan={5}>
                  المجموع
                </td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">{money(shipmentTotal)}</td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">{money(depositTotal)}</td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">{money(postponeTotal)}</td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">{money(refusalTotal)}</td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">{money(netTotal)}</td>
                <td colSpan={2} className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                  شحن الأسبوع {money(shippingTotal)}
                </td>
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
        <p className="text-sm font-extrabold text-[#14213D]">تحصيل الأسبوع الحالي: {money(weekCollectDue)} ج</p>
        <p className="text-sm font-extrabold text-[#14213D]">مؤجلات سابقة: {money(priorPostponeCollectDue)} ج</p>
        <p className="text-sm font-extrabold text-[#14213D]">الصافي المستحق: {money(cashDue)} ج</p>
        {priorPostponeCollectedOrders.length ? (
          <p className="text-xs font-bold text-[#14213D]/80 sm:col-span-2 lg:col-span-4" dir="ltr">
            أوردرات مؤجلة سابقة ومحصّلة هذا الأسبوع:{" "}
            {priorPostponeCollectedOrders.map((n) => `#${n}`).join(" · ")}
          </p>
        ) : null}
        <p className="text-xs font-bold text-[#14213D]/70 sm:col-span-2 lg:col-span-4">
          المطلوب تحصيله = تحصيل الأسبوع + مؤجلات سابقة. الالغاء والمؤجل الحالي مش داخل المطلوب. الأسبوع القديم ما بيتأثرش.
        </p>
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
          <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void submit("save")}
              className="h-9 rounded-lg bg-[#E5E5E5] px-3 text-xs font-extrabold"
            >
              حفظ
            </button>
            {fullWeek ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => void submit("close-week")}
                className="h-9 rounded-lg bg-[#FCA311] px-3 text-xs font-extrabold"
              >
                قفل الأسبوع
              </button>
            ) : (
              <p className="text-xs font-bold text-[#14213D]/70">قفل الأسبوع يظهر لما الفترة تبقى من الأحد للسبت.</p>
            )}
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
            {month.weeks.length} أسبوع · {month.deliveredOrders} أوردر مسلّم · إجمالي شحن الشهر {money(month.shippingTotal)} ج
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

      <div className="space-y-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
        <h2 className="text-lg font-extrabold text-[#14213D]">بيان الأوردرات المرفوضة</h2>
        <p className="text-xs font-bold text-[#14213D]/70">
          للمخزن قبل تصفية الأحد. الرفض والالغاء مش داخل واجب التحصيل.
        </p>
        {refusals.length === 0 ? (
          <p className="text-sm font-bold text-[#14213D]/60">مفيش أوردرات مرفوضة في الفترة دي.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">أوردر</th>
                  <th className="border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">العميل</th>
                  <th className="border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">موبايل</th>
                  <th className="border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">المنتج</th>
                  <th className="border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">يوم الشيت</th>
                  <th className="border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">السبب</th>
                </tr>
              </thead>
              <tbody>
                {refusals.map((row) => (
                  <tr key={row.confirmationId}>
                    <td className="border border-[#14213D]/15 px-2 py-2 font-extrabold" dir="ltr">
                      {row.wooOrderNumber}
                    </td>
                    <td className="border border-[#14213D]/15 px-2 py-2">{row.customerName}</td>
                    <td className="border border-[#14213D]/15 px-2 py-2" dir="ltr">
                      {row.phone || "—"}
                    </td>
                    <td className="border border-[#14213D]/15 px-2 py-2">{row.productNames}</td>
                    <td className="border border-[#14213D]/15 px-2 py-2">
                      {row.sheetDay ? formatDayAr(row.sheetDay) : "—"}
                    </td>
                    <td className="border border-[#14213D]/15 px-2 py-2">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`print-only hidden ${printKind === "week" ? "print-target" : ""}`} dir="rtl">
        <h1 className="mb-2 text-center text-lg font-extrabold">
          {weekStart && weekStart === weekEnd ? formatSayedSheetHeading(weekStart) : `تصفية سيد تميمة من ${weekStart} إلى ${weekEnd}`}
        </h1>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1">مسلسل</th>
              <th className="border border-black px-1 py-1">أوردر</th>
              <th className="border border-black px-1 py-1">العميل</th>
              <th className="border border-black px-1 py-1">موبايل</th>
              <th className="border border-black px-1 py-1">المنتج</th>
              <th className="border border-black px-1 py-1">قيمة الشحنات</th>
              <th className="border border-black px-1 py-1">ديبوزت</th>
              <th className="border border-black px-1 py-1">المؤجل</th>
              <th className="border border-black px-1 py-1">الرفض</th>
              <th className="border border-black px-1 py-1">الصافي</th>
              <th className="border border-black px-1 py-1">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {dayBlocks.map((block) => (
              <Fragment key={`print-${block.key}`}>
                <tr>
                  <td colSpan={11} className="border border-black bg-[#E5E5E5] px-1 py-1 text-center font-extrabold">
                    {block.title}
                  </td>
                </tr>
                {block.rows.map((row) => (
                  <tr key={`print-${row.confirmationId}-${row.postponeLineId || 0}`}>
                    <td className="border border-black px-1 py-1 text-center">
                      {serials.get(`${row.confirmationId}-${row.postponeLineId || 0}`) || ""}
                    </td>
                    <td className="border border-black px-1 py-1" dir="ltr">{row.wooOrderNumber}</td>
                    <td className="border border-black px-1 py-1">{row.customerName}</td>
                    <td className="border border-black px-1 py-1" dir="ltr">{row.phone || ""}</td>
                    <td className="border border-black px-1 py-1">{row.productNames || ""}</td>
                    <td className="border border-black px-1 py-1 text-center">{row.carried ? "" : money(shipmentValue(row))}</td>
                    <td className="border border-black px-1 py-1 text-center">{row.depositAmount ? money(row.depositAmount) : ""}</td>
                    <td className="border border-black px-1 py-1 text-center">{postponeValue(row) ? money(postponeValue(row)) : ""}</td>
                    <td className="border border-black px-1 py-1 text-center">{refusalValue(row) ? money(refusalValue(row)) : ""}</td>
                    <td className="border border-black px-1 py-1 text-center">{netValue(row) ? money(netValue(row)) : ""}</td>
                    <td className="border border-black px-1 py-1">{dispositionLabel(row)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} className="border border-black px-1 py-1 font-extrabold">
                    {block.key === "carried" ? block.title : "تصفية اليوم"}
                  </td>
                  <td className="border border-black px-1 py-1 text-center font-extrabold">
                    {money(sumOf(block.rows, (row) => (row.carried ? 0 : shipmentValue(row))))}
                  </td>
                  <td className="border border-black px-1 py-1 text-center font-extrabold">{money(sumOf(block.rows, (row) => row.depositAmount || 0))}</td>
                  <td className="border border-black px-1 py-1 text-center font-extrabold">{money(sumOf(block.rows, postponeValue))}</td>
                  <td className="border border-black px-1 py-1 text-center font-extrabold">{money(sumOf(block.rows, refusalValue))}</td>
                  <td className="border border-black px-1 py-1 text-center font-extrabold">{money(sumOf(block.rows, netValue))}</td>
                  <td className="border border-black px-1 py-1 text-center font-extrabold">
                    شحن اليوم {money(sumOf(block.rows, shippingFee))}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          {rows.length ? (
            <tfoot>
              <tr>
                <td colSpan={5} className="border border-black px-1 py-1 font-extrabold">المجموع</td>
                <td className="border border-black px-1 py-1 text-center font-extrabold">{money(shipmentTotal)}</td>
                <td className="border border-black px-1 py-1 text-center font-extrabold">{money(depositTotal)}</td>
                <td className="border border-black px-1 py-1 text-center font-extrabold">{money(postponeTotal)}</td>
                <td className="border border-black px-1 py-1 text-center font-extrabold">{money(refusalTotal)}</td>
                <td className="border border-black px-1 py-1 text-center font-extrabold">{money(netTotal)}</td>
                <td className="border border-black px-1 py-1 text-center font-extrabold">شحن الأسبوع {money(shippingTotal)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        {month ? (
          <p className="mt-2 text-center text-sm font-extrabold">إجمالي شحن الشهر {money(month.shippingTotal)} ج</p>
        ) : null}
      </div>

      <div className={`print-only hidden ${printKind === "refusals" ? "print-target" : ""}`} dir="rtl">
        <h1 className="mb-2 text-center text-lg font-extrabold">
          بيان الأوردرات المرفوضة من {weekStart} إلى {weekEnd}
        </h1>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1">أوردر</th>
              <th className="border border-black px-1 py-1">العميل</th>
              <th className="border border-black px-1 py-1">موبايل</th>
              <th className="border border-black px-1 py-1">المنتج</th>
              <th className="border border-black px-1 py-1">يوم الشيت</th>
              <th className="border border-black px-1 py-1">السبب</th>
            </tr>
          </thead>
          <tbody>
            {refusals.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-black px-1 py-2 text-center">
                  مفيش أوردرات مرفوضة في الفترة دي.
                </td>
              </tr>
            ) : (
              refusals.map((row) => (
                <tr key={`print-ref-${row.confirmationId}`}>
                  <td className="border border-black px-1 py-1" dir="ltr">{row.wooOrderNumber}</td>
                  <td className="border border-black px-1 py-1">{row.customerName}</td>
                  <td className="border border-black px-1 py-1" dir="ltr">{row.phone || ""}</td>
                  <td className="border border-black px-1 py-1">{row.productNames}</td>
                  <td className="border border-black px-1 py-1">{row.sheetDay ? formatDayAr(row.sheetDay) : ""}</td>
                  <td className="border border-black px-1 py-1">{row.reason}</td>
                </tr>
              ))
            )}
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
