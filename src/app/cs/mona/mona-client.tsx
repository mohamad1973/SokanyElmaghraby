"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

type Outcome = "delivered" | "refused" | "postponed";

type OrderCard = {
  id: number;
  wooOrderNumber: string;
  invoiceNumber: string;
  customerName: string;
  phone: string;
  altPhone: string;
  governorate: string;
  area: string;
  address: string;
  landmarks: string;
  items: Array<{ name: string; quantity: number; price: number; lineTotal: number }>;
  total: string;
  cashAmount: number;
  outcome: Outcome | null;
  official: Outcome | null;
  refusalReason: string;
  courierId: number | null;
  courierName: string;
  assignedDay: string;
  orderTotal: number;
  depositAmount: number;
  productNames: string;
  isLarge: boolean;
};

type LedgerLine = {
  courierId: number;
  name: string;
  delivered: number;
  postponed: number;
  refused: number;
  goods: number;
  collected: number;
  fee: number;
  remitted: number;
  remaining: number;
  invoiceCollected: number;
  invoiceShipping: number;
  invoiceRemitted: number;
  invoiceRemaining: number;
};

type DayAccount = {
  courierId: number;
  dayYmd: string;
  collected: number | null;
  shipping: number | null;
  remitted: number | null;
};

type Desk = {
  mode: "supervisor" | "courier";
  canEditMoney?: boolean;
  day?: string | null;
  couriers: Array<{ id: number; name: string }>;
  orders: OrderCard[];
  returned?: OrderCard[];
  ledger: LedgerLine[];
  dayAccounts?: DayAccount[];
};

type DayDraft = { collected: string | null; shipping: string | null; remitted: string };

const MONA_DAY_FEE = 75;
const MONA_DAY_LARGE_FEE = 100;

function egp(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function orderState(order: OrderCard) {
  if (order.outcome === "delivered") return "مسلم";
  if (order.outcome === "postponed") return "مؤجّل";
  if (order.outcome === "refused") return "رفض";
  return "متوزع";
}

const SHEET_COLS = 13;

function phoneDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function openDateField(event: { currentTarget: HTMLElement }) {
  const input = event.currentTarget.querySelector("input[type='date']");
  if (!(input instanceof HTMLInputElement)) return;
  input.focus();
  try {
    input.showPicker();
  } catch {
    // Picker already open, or this browser only opens it from the calendar control.
  }
}

function matchesAccountSearch(order: OrderCard, rawQuery: string) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const phone = phoneDigits(order.phone);
  const alt = phoneDigits(order.altPhone);
  const hay = [
    order.wooOrderNumber,
    order.invoiceNumber,
    order.customerName,
    order.phone,
    phone,
    phone.length >= 10 ? phone.slice(-10) : phone,
    order.altPhone,
    alt,
    order.address,
    order.landmarks,
    order.area,
    order.governorate,
    order.productNames,
    order.total,
    order.refusalReason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (hay.includes(q)) return true;
  const qDigits = phoneDigits(q);
  if (qDigits.length >= 4) {
    if (phone.includes(qDigits) || phone.slice(-10).includes(qDigits.slice(-10))) return true;
    if (alt.includes(qDigits) || alt.slice(-10).includes(qDigits.slice(-10))) return true;
    if (String(order.wooOrderNumber).includes(qDigits)) return true;
    if (String(order.invoiceNumber || "").includes(qDigits)) return true;
  }
  return false;
}

function AccountDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="cs-date-field flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[#14213D]/15 bg-[#F5F5F0] px-2"
      onClick={openDateField}
    >
      <span className="pointer-events-none shrink-0 text-xs font-extrabold text-[#14213D]/60">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-sm font-bold text-[#14213D] outline-none"
      />
    </div>
  );
}

function orderNumber(order: OrderCard) {
  return Number(String(order.wooOrderNumber).replace(/\D/g, "")) || 0;
}

function monaDayHeading(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "بدون يوم";
  const [year, month, day] = ymd.split("-").map((part) => Number(part));
  const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "short",
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
  const weekday = weekdays[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short)] || "";
  return `يوم ${weekday} ${day}-${month}`;
}

function dayInSpan(day: string, from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(to) ? (from <= to ? to : from) : from;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(to) ? (from <= to ? from : to) : from;
  return day >= start && day <= end;
}

function dayBlocksOf(orders: OrderCard[]) {
  const byDay = new Map<string, OrderCard[]>();
  const undated: OrderCard[] = [];
  for (const order of orders) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(order.assignedDay)) {
      undated.push(order);
      continue;
    }
    const list = byDay.get(order.assignedDay) || [];
    list.push(order);
    byDay.set(order.assignedDay, list);
  }
  const blocks = [...byDay.keys()].sort().map((day) => ({
    key: day,
    title: monaDayHeading(day),
    rows: (byDay.get(day) || []).sort((a, b) => orderNumber(b) - orderNumber(a)),
  }));
  if (undated.length) {
    blocks.push({
      key: "undated",
      title: "بدون يوم",
      rows: undated.sort((a, b) => orderNumber(b) - orderNumber(a)),
    });
  }
  return blocks;
}

function shipmentValue(order: OrderCard) {
  return Math.max(0, Number(order.orderTotal) || 0);
}

function goodsAfterDeposit(order: OrderCard) {
  if (order.official === "refused") return 0;
  return Math.max(0, shipmentValue(order) - (Number(order.depositAmount) || 0));
}

function remainder(order: OrderCard) {
  return Math.max(0, Number(order.cashAmount) || 0);
}

function postponeValue(order: OrderCard) {
  return order.official === "postponed" ? remainder(order) : 0;
}

function refusalValue(order: OrderCard) {
  return order.official === "refused" ? remainder(order) : 0;
}

function netValue(order: OrderCard) {
  if (order.official !== "delivered") return 0;
  return Math.max(0, (Number(order.orderTotal) || 0) - (Number(order.depositAmount) || 0));
}

function sumOf(list: OrderCard[], pick: (order: OrderCard) => number) {
  return list.reduce((sum, order) => sum + pick(order), 0);
}

function shippingOrder(order: OrderCard) {
  return order.outcome === "delivered" || order.official === "delivered";
}

function dayShipping(rows: OrderCard[]) {
  return rows.reduce((sum, order) => {
    if (!shippingOrder(order)) return sum;
    return sum + (order.isLarge ? MONA_DAY_LARGE_FEE : MONA_DAY_FEE);
  }, 0);
}

function dayRemaining(collected: string, remitted: string, shipping: number) {
  if (collected.trim() === "") return null;
  const paidIn = Number(collected);
  const handed = remitted.trim() === "" ? 0 : Number(remitted);
  if (!Number.isFinite(paidIn) || !Number.isFinite(handed)) return null;
  return paidIn - shipping - handed;
}

function moneyText(value: number | null) {
  return value == null || Number.isNaN(value) ? "" : egp(value);
}

function shownMoney(text: string | null, fallback: number) {
  if (text == null || text.trim() === "") return moneyText(fallback);
  return text;
}

function fieldValue(text: string | null, fallback: number) {
  return text == null ? moneyText(fallback) : text;
}

function overrideAmount(text: string | null, fallback: number) {
  if (text == null || text.trim() === "") return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (Math.abs(amount - fallback) < 0.001) return null;
  return Math.round(amount * 100) / 100;
}

function emptyDayDraft(saved?: DayAccount): DayDraft {
  return {
    collected: saved?.collected == null ? null : moneyText(saved.collected),
    shipping: saved?.shipping == null ? null : moneyText(saved.shipping),
    remitted: moneyText(saved?.remitted ?? null),
  };
}

function InvoiceField({
  confirmationId,
  value,
  onSaved,
}: {
  confirmationId: number;
  value: string;
  onSaved: (next: string) => void;
}) {
  const [text, setText] = useState(value);
  const [hint, setHint] = useState("");
  const timer = useRef<number | null>(null);
  const saved = useRef(value);

  useEffect(() => {
    setText(value);
    saved.current = value;
  }, [value]);

  async function persist(next: string) {
    const trimmed = next.trim();
    if (trimmed === saved.current.trim()) return;
    setHint("جاري التحميل");
    const res = await fetch(`/api/cs/confirmations/${confirmationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceNumber: trimmed }),
    });
    const data = (await res.json()) as { message?: string; invoiceNumber?: string | null };
    if (!res.ok) {
      setHint(data.message || "تعذر الحفظ");
      return;
    }
    const stored = data.invoiceNumber || "";
    saved.current = stored;
    setText(stored);
    onSaved(stored);
    setHint("");
  }

  return (
    <input
      value={text}
      dir="ltr"
      inputMode="numeric"
      maxLength={10}
      aria-label="رقم الفاتورة"
      title={hint}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, "").slice(0, 10);
        setText(next);
        setHint("");
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void persist(next), 700);
      }}
      onBlur={() => {
        if (timer.current) window.clearTimeout(timer.current);
        void persist(text);
      }}
      className="h-8 w-24 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-center text-xs font-bold text-[#14213D]"
    />
  );
}

function cairoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function DayAccountBox({
  rows,
  draft,
  canEdit,
  onDraft,
  onSave,
}: {
  rows: OrderCard[];
  draft: DayDraft;
  canEdit: boolean;
  onDraft: (next: DayDraft) => void;
  onSave: () => void;
}) {
  const goods = sumOf(rows, goodsAfterDeposit);
  const autoShipping = dayShipping(rows);
  const collectedShown = shownMoney(draft.collected, goods);
  const shippingShown = shownMoney(draft.shipping, autoShipping);
  const remaining = dayRemaining(collectedShown, draft.remitted, Number(shippingShown) || 0);
  return (
    <div className="grid gap-2 bg-[#F8F4EA] px-3 py-3 text-sm font-extrabold text-[#14213D]">
      <p className="flex items-center justify-between gap-3">
        <span>إجمالي قيمة البضاعة</span>
        <span>{egp(goods)} ج.م</span>
      </p>
      {canEdit ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label className="flex items-center justify-between gap-3">
            <span>القيمة المحصلة</span>
            <input
              value={fieldValue(draft.collected, goods)}
              onChange={(event) => onDraft({ ...draft, collected: event.target.value })}
              onBlur={(event) => {
                if (event.currentTarget.value.trim() === "") onDraft({ ...draft, collected: null });
              }}
              inputMode="decimal"
              className="h-9 w-36 rounded-lg border border-[#14213D]/15 bg-white px-2 text-left font-bold"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>إجمالي تكلفة الشحن</span>
            <input
              value={fieldValue(draft.shipping, autoShipping)}
              onChange={(event) => onDraft({ ...draft, shipping: event.target.value })}
              onBlur={(event) => {
                if (event.currentTarget.value.trim() === "") onDraft({ ...draft, shipping: null });
              }}
              inputMode="decimal"
              className="h-9 w-36 rounded-lg border border-[#14213D]/15 bg-white px-2 text-left font-bold"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>التوريد النقدي</span>
            <input
              value={draft.remitted}
              onChange={(event) => onDraft({ ...draft, remitted: event.target.value })}
              inputMode="decimal"
              className="h-9 w-36 rounded-lg border border-[#14213D]/15 bg-white px-2 text-left font-bold"
            />
          </label>
          <p className="flex items-center justify-between gap-3 text-base">
            <span>المتبقي</span>
            <span>{remaining == null ? "—" : `${egp(remaining)} ج.م`}</span>
          </p>
          <button type="submit" className="h-8 w-fit justify-self-end rounded-lg bg-[#FCA311] px-3 text-xs font-extrabold text-black">
            حفظ اليوم
          </button>
        </form>
      ) : (
        <>
          <p className="flex items-center justify-between gap-3">
            <span>القيمة المحصلة</span>
            <span>{collectedShown.trim() === "" ? "—" : `${collectedShown} ج.م`}</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span>إجمالي تكلفة الشحن</span>
            <span>{shippingShown.trim() === "" ? "—" : `${shippingShown} ج.م`}</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span>التوريد النقدي</span>
            <span>{draft.remitted.trim() === "" ? "—" : `${draft.remitted} ج.م`}</span>
          </p>
          <p className="flex items-center justify-between gap-3 text-base">
            <span>المتبقي</span>
            <span>{remaining == null ? "—" : `${egp(remaining)} ج.م`}</span>
          </p>
        </>
      )}
    </div>
  );
}

function CourierInvoice({
  line,
  orders,
  canEditMoney,
  dayAccounts,
  drafts,
  dayFrom,
  dayTo,
  onDraft,
  onSaveDay,
  onOfficial,
  onUnassign,
  onLarge,
  onInvoice,
  query,
}: {
  line: LedgerLine;
  orders: OrderCard[];
  canEditMoney: boolean;
  dayAccounts: DayAccount[];
  drafts: Record<string, DayDraft>;
  dayFrom: string;
  dayTo: string;
  onDraft: (dayYmd: string, next: DayDraft) => void;
  onSaveDay: (
    dayYmd: string,
    amounts: { collected: number | null; shipping: number | null; remitted: number | null },
  ) => void;
  onOfficial?: (confirmationId: number, result: "delivered" | "refused" | "postponed" | null) => void;
  onUnassign?: (confirmationId: number) => void;
  onLarge?: (confirmationId: number, isLarge: boolean) => void;
  onInvoice?: (confirmationId: number, invoiceNumber: string) => void;
  query: string;
}) {
  const mine = orders.filter((order) => Number(order.courierId) === Number(line.courierId));
  const searching = query.trim().length > 0;
  const spanBlocks = dayBlocksOf(mine).filter((block) => searching || dayInSpan(block.key, dayFrom, dayTo));
  const serials = new Map<number, number>();
  for (const block of spanBlocks) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(block.key)) continue;
    block.rows.forEach((order, index) => serials.set(order.id, index + 1));
  }
  const dayBlocks = spanBlocks
    .map((block) => ({
      ...block,
      accountRows: block.rows,
      rows: block.rows.filter((order) => matchesAccountSearch(order, query)),
    }))
    .filter((block) => block.rows.length > 0);
  const accountRows = dayBlocks.flatMap((block) => block.accountRows);
  const moneyCell = (value: number) => (value ? egp(value) : "");
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-[#14213D]/15">
      <header className="flex items-center justify-between gap-3 bg-[#14213D] px-4 py-3 text-white">
        <h3 className="text-lg font-extrabold">حساب {line.name}</h3>
        <p className="text-xs font-bold text-[#FCA311]">
          مسلّم {line.delivered} · مؤجّل {line.postponed} · رفض {line.refused}
        </p>
      </header>
      <div className="max-h-[calc(100vh-8rem)] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="text-right">
            <tr>
              {["مسلسل", "أوردر", "فاتورة", "العميل", "موبايل", "المنتج", "قيمة الشحنات", "ديبوزت", "المؤجل", "الرفض", "الصافي", "الحالة", "كبير"].map(
                (head) => (
                  <th key={head} className="sticky top-0 z-10 border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2">
                    {head}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {mine.length === 0 ? (
              <tr>
                <td colSpan={SHEET_COLS} className="border border-[#14213D]/15 px-3 py-8 text-center font-bold text-[#14213D]/60">
                  مفيش أوردرات عند المندوب.
                </td>
              </tr>
            ) : dayBlocks.length === 0 ? (
              <tr>
                <td colSpan={SHEET_COLS} className="border border-[#14213D]/15 px-3 py-8 text-center font-bold text-[#14213D]/60">
                  {searching ? "مفيش أوردر مطابق للبحث." : "مفيش أوردرات في اليوم ده."}
                </td>
              </tr>
            ) : (
              dayBlocks.map((block, index) => {
                const saved = dayAccounts.find((row) => row.dayYmd === block.key);
                const draft = drafts[block.key] || emptyDayDraft(saved);
                const goods = sumOf(block.accountRows, goodsAfterDeposit);
                const autoShipping = dayShipping(block.accountRows);
                const remaining = dayRemaining(
                  shownMoney(draft.collected, goods),
                  draft.remitted,
                  Number(shownMoney(draft.shipping, autoShipping)) || 0,
                );
                const settled = remaining === 0;
                return (
                <Fragment key={block.key}>
                  <tr>
                    <td
                      colSpan={SHEET_COLS}
                      className={`border border-[#14213D]/25 px-3 py-2 text-center text-sm font-extrabold ${
                        settled ? "bg-emerald-700 text-white" : "bg-orange-500 text-black"
                      }`}
                    >
                      {block.title}
                    </td>
                  </tr>
                  {block.rows.map((order) => (
                    <tr key={order.id}>
                      <td className="border border-[#14213D]/25 px-2 py-2 text-center font-extrabold tabular-nums">
                        {serials.get(order.id) || ""}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2 font-extrabold">
                        <div className="flex items-center justify-between gap-2">
                          <span dir="ltr">{order.wooOrderNumber}</span>
                          {canEditMoney && onUnassign ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!window.confirm(`تشيل الأوردر ${order.wooOrderNumber} من الشيت؟`)) return;
                                onUnassign(order.id);
                              }}
                              className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-extrabold text-red-700"
                            >
                              شيل
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2">
                        <InvoiceField
                          confirmationId={order.id}
                          value={order.invoiceNumber || ""}
                          onSaved={(next) => onInvoice?.(order.id, next)}
                        />
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2">{order.customerName || "—"}</td>
                      <td className="whitespace-nowrap border border-[#14213D]/15 px-2 py-2 tabular-nums" dir="ltr">
                        {order.phone || "—"}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2">{order.productNames || "—"}</td>
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {moneyCell(shipmentValue(order))}
                      </td>
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {moneyCell(order.depositAmount)}
                      </td>
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {moneyCell(postponeValue(order))}
                      </td>
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {moneyCell(refusalValue(order))}
                      </td>
                      <td className="whitespace-nowrap border border-[#14213D]/25 px-2 py-2 text-center tabular-nums">
                        {moneyCell(netValue(order))}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2">
                        <select
                          value={order.official || ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (!onOfficial) return;
                            if (value === "delivered" || value === "refused" || value === "postponed") onOfficial(order.id, value);
                            else onOfficial(order.id, null);
                          }}
                          className="h-8 rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2 text-xs font-bold"
                        >
                          <option value="">لم يُعلَّم</option>
                          <option value="delivered">تم بنجاح</option>
                          <option value="refused">الغاء</option>
                          <option value="postponed">مؤجل</option>
                        </select>
                        {order.outcome === "delivered" ? (
                          <span className="mt-1 block w-fit rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-900">
                            تم بنجاح
                          </span>
                        ) : null}
                        {order.outcome === "refused" ? (
                          <span className="mt-1 block w-fit rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-extrabold text-red-800">
                            تم الرفض{order.refusalReason ? `: ${order.refusalReason}` : ""}
                          </span>
                        ) : null}
                        {order.outcome === "postponed" ? (
                          <span className="mt-1 block w-fit rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-extrabold text-orange-900">
                            تأجيل
                          </span>
                        ) : null}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          disabled={!shippingOrder(order)}
                          checked={order.isLarge}
                          onChange={(event) => onLarge?.(order.id, event.target.checked)}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={6} className="border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 font-extrabold text-[#14213D]">
                      تصفية اليوم
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {egp(sumOf(block.accountRows, shipmentValue))}
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {egp(sumOf(block.accountRows, (order) => order.depositAmount || 0))}
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {egp(sumOf(block.accountRows, postponeValue))}
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {egp(sumOf(block.accountRows, refusalValue))}
                    </td>
                    <td className="whitespace-nowrap border border-[#14213D]/25 bg-[#F5F5F0] px-2 py-2 text-center font-extrabold tabular-nums">
                      {egp(sumOf(block.accountRows, netValue))}
                    </td>
                    <td colSpan={2} className="border border-[#14213D]/15 bg-[#F5F5F0]" />
                  </tr>
                  {/^\d{4}-\d{2}-\d{2}$/.test(block.key) ? (
                    <tr>
                      <td colSpan={SHEET_COLS} className="border border-[#14213D]/25 p-0">
                        <DayAccountBox
                          rows={block.accountRows}
                          canEdit={canEditMoney}
                          draft={draft}
                          onDraft={(next) => onDraft(block.key, next)}
                          onSave={() =>
                            onSaveDay(block.key, {
                              collected: overrideAmount(draft.collected, goods),
                              shipping: overrideAmount(draft.shipping, autoShipping),
                              remitted: draft.remitted.trim() === "" ? null : Number(draft.remitted),
                            })
                          }
                        />
                      </td>
                    </tr>
                  ) : null}
                  {index < dayBlocks.length - 1 ? (
                    <tr aria-hidden>
                      <td colSpan={SHEET_COLS} className="h-5 border-0 bg-[#F7F4EF]" />
                    </tr>
                  ) : null}
                </Fragment>
                );
              })
            )}
          </tbody>
          {accountRows.length ? (
            <tfoot>
              <tr>
                <td className="border border-[#14213D] bg-[#14213D] px-2 py-2 font-extrabold text-white" colSpan={6}>
                  المجموع
                </td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                  {egp(sumOf(accountRows, shipmentValue))}
                </td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                  {egp(sumOf(accountRows, (order) => order.depositAmount || 0))}
                </td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                  {egp(sumOf(accountRows, postponeValue))}
                </td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                  {egp(sumOf(accountRows, refusalValue))}
                </td>
                <td className="whitespace-nowrap border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                  {egp(sumOf(accountRows, netValue))}
                </td>
                <td colSpan={2} className="border border-[#14213D] bg-[#14213D]" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </article>
  );
}

function OrderDetails({ order }: { order: OrderCard }) {
  const invoice = String(order.invoiceNumber || "").trim();
  return (
    <div className="grid gap-1 text-sm text-[#14213D]">
      <p className="text-base font-extrabold">
        #{order.wooOrderNumber} · {order.customerName || "—"}
      </p>
      <p
        className={`w-fit rounded-lg px-2 py-1 text-sm font-extrabold ${
          invoice ? "bg-[#FCA311] text-black" : "bg-[#14213D]/10 text-[#14213D]"
        }`}
        dir="ltr"
      >
        فاتورة {invoice || "—"}
      </p>
      <p className="font-bold">
        {order.phone || "—"}
        {order.altPhone ? ` · ${order.altPhone}` : ""}
      </p>
      <p className="font-bold">{[order.governorate, order.area].filter(Boolean).join(" · ") || "منطقة غير مسجلة"}</p>
      <p>{order.address || "—"}</p>
      {order.landmarks ? <p className="text-[#14213D]/70">علامات: {order.landmarks}</p> : null}
      {order.items.length ? (
        <ul className="list-disc pr-4 text-xs font-bold">
          {order.items.map((item) => (
            <li key={`${item.name}-${item.quantity}`}>
              {item.name} × {item.quantity}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="font-extrabold">تحصيل {egp(order.cashAmount)} ج.م</p>
    </div>
  );
}

function CourierCard({
  order,
  onPost,
  canAct,
}: {
  order: OrderCard;
  onPost: (body: Record<string, unknown>) => Promise<boolean>;
  canAct: boolean;
}) {
  const [reason, setReason] = useState("");
  const [askingRefuse, setAskingRefuse] = useState(false);
  const tone =
    order.outcome === "delivered"
      ? "bg-emerald-100 ring-emerald-600"
      : order.outcome === "refused"
        ? "bg-red-100 ring-red-600"
        : order.outcome === "postponed"
          ? "bg-orange-100 ring-orange-500"
          : "bg-white ring-[#14213D]/10";
  const locked = order.outcome === "delivered" || !canAct;
  return (
    <article className={`grid gap-3 rounded-2xl p-4 shadow ring-1 ${tone}`}>
      <OrderDetails order={order} />
      {order.outcome ? null : <p className="text-sm font-extrabold text-[#14213D]">متوزع</p>}
      {order.outcome === "delivered" ? <p className="text-base font-extrabold text-emerald-800">تم بنجاح</p> : null}
      {order.outcome === "refused" ? (
        <p className="text-sm font-extrabold text-red-800">تم الرفض{order.refusalReason ? `: ${order.refusalReason}` : ""}</p>
      ) : null}
      {order.outcome === "postponed" ? <p className="text-sm font-extrabold text-orange-800">تأجيل</p> : null}
      {locked ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onPost({ action: "outcome", confirmationId: order.id, outcome: "delivered" })}
            className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-extrabold text-white"
          >
            تم التسليم
          </button>
          <button
            type="button"
            onClick={() => setAskingRefuse((open) => !open)}
            className="rounded-xl bg-red-700 px-3 py-2 text-sm font-extrabold text-white"
          >
            رفض الاستلام
          </button>
          <button
            type="button"
            onClick={() => void onPost({ action: "outcome", confirmationId: order.id, outcome: "postponed" })}
            className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-extrabold text-black"
          >
            تأجيل
          </button>
        </div>
      )}
      {askingRefuse && !locked ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onPost({ action: "outcome", confirmationId: order.id, outcome: "refused", reason });
          }}
        >
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="سبب الرفض"
            className="h-10 min-w-0 flex-1 rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-[#14213D]"
          />
          <button type="submit" className="rounded-xl bg-red-700 px-3 py-2 text-sm font-extrabold text-white">
            حفظ الرفض
          </button>
        </form>
      ) : null}
    </article>
  );
}

function ReturnedOrder({
  order,
  couriers,
  onAssign,
}: {
  order: OrderCard;
  couriers: Array<{ id: number; name: string }>;
  onAssign: (courierId: number) => void;
}) {
  const [pick, setPick] = useState("");
  return (
    <article className="grid gap-2 rounded-2xl bg-orange-100 p-3 shadow ring-1 ring-orange-500">
      <p className="text-sm font-extrabold text-orange-800">مؤجل</p>
      <p className="text-sm font-extrabold text-[#14213D]">
        #{order.wooOrderNumber} · {order.customerName || "—"}
      </p>
      <p className="text-xs font-bold text-[#14213D]" dir="ltr">
        {order.phone || "—"}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={pick}
          onChange={(event) => setPick(event.target.value)}
          className="h-10 min-w-36 rounded-xl border border-orange-300 bg-white px-3 text-sm font-bold text-[#14213D]"
        >
          <option value="">مندوب تاني</option>
          {couriers.map((courier) => (
            <option key={courier.id} value={courier.id}>
              {courier.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pick}
          onClick={() => onAssign(Number(pick))}
          className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-50"
        >
          توزيع
        </button>
      </div>
    </article>
  );
}

function reportRows(orders: OrderCard[], accounts: DayAccount[], from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const days = new Set<string>();
  for (const order of orders) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(order.assignedDay)) days.add(order.assignedDay);
  }
  for (const account of accounts) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(account.dayYmd)) days.add(account.dayYmd);
  }
  return [...days]
    .filter((day) => day >= start && day <= end)
    .sort()
    .map((day) => {
      const rows = orders.filter((order) => order.assignedDay === day);
      const saved = accounts.find((row) => row.dayYmd === day);
      const goods = sumOf(rows, goodsAfterDeposit);
      const shipping = saved?.shipping ?? dayShipping(rows);
      const collected = saved?.collected ?? goods;
      const remitted = saved?.remitted ?? null;
      return {
        day,
        goods,
        collected,
        shipping,
        remitted,
        remaining: (collected || 0) - shipping - (remitted || 0),
      };
    });
}

export function MonaCourierPanel({
  mode,
  focusCourierId,
}: {
  mode: "supervisor" | "courier";
  focusCourierId?: number;
}) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [orderNumber, setOrderNumber] = useState("");
  const [tab, setTab] = useState<"sheet" | "report">("sheet");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [sheetDay, setSheetDay] = useState(cairoToday);
  const [sheetTo, setSheetTo] = useState("");
  const [sheetQuery, setSheetQuery] = useState("");
  const [dayDrafts, setDayDrafts] = useState<Record<string, DayDraft>>({});
  /** Courier phone: defaults to today; not persisted across visits. */
  const [courierDay, setCourierDay] = useState(cairoToday);

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (mode === "courier") {
      query.set("scope", "own");
      query.set("day", courierDay || cairoToday());
    } else if (focusCourierId) {
      query.set("courierId", String(focusCourierId));
    }
    const res = await fetch(`/api/cs/mona-couriers${query.size ? `?${query}` : ""}`);
    const data = (await res.json()) as Desk | { message?: string };
    setLoading(false);
    if (!res.ok || !("orders" in data)) {
      setMessage(("message" in data && data.message) || "تعذر تحميل مناديب المشرفة.");
      return;
    }
    setDesk(data);
    const today = cairoToday();
    setFromDay((current) => current || `${today.slice(0, 8)}01`);
    setToDay((current) => current || today);
    setDayDrafts(() => {
      const next: Record<string, DayDraft> = {};
      for (const row of data.dayAccounts || []) {
        next[row.dayYmd] = emptyDayDraft(row);
      }
      return next;
    });
    setMessage("");
  }, [mode, focusCourierId, courierDay]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/cs/mona-couriers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    setMessage(data?.message || (res.ok ? "تم." : "تعذر التنفيذ."));
    if (res.ok) await load();
    return res.ok;
  }

  function rememberOfficial(confirmationId: number, result: Outcome | null, isLarge?: boolean) {
    setDesk((current) => {
      if (!current) return current;
      return {
        ...current,
        orders: current.orders.map((order) =>
          order.id === confirmationId
            ? {
                ...order,
                official: result,
                isLarge: result === "delivered" || order.outcome === "delivered" ? (isLarge ?? order.isLarge) : false,
              }
            : order,
        ),
      };
    });
  }

  const couriers = desk?.couriers || [];
  const orders = desk?.orders || [];
  const focused = couriers.find((courier) => courier.id === focusCourierId) || couriers[0];
  const focusedOrders = focused ? orders.filter((order) => Number(order.courierId) === Number(focused.id)) : [];
  const focusedAccounts = (desk?.dayAccounts || []).filter((row) => !focused || row.courierId === focused.id);
  const report = reportRows(focusedOrders, focusedAccounts, fromDay, toDay);
  const reportTotal = report.reduce(
    (sum, row) => ({
      goods: sum.goods + row.goods,
      collected: sum.collected + (row.collected || 0),
      shipping: sum.shipping + row.shipping,
      remitted: sum.remitted + (row.remitted || 0),
      remaining: sum.remaining + row.remaining,
    }),
    { goods: 0, collected: 0, shipping: 0, remitted: 0, remaining: 0 },
  );

  return (
    <section className="no-print grid gap-3 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold text-[#14213D]">
            {mode === "courier" ? "مناديب المشرفة" : focused ? `حساب ${focused.name}` : "حساب المندوب"}
          </h2>
          {mode === "courier" ? (
            <p className="text-xs font-bold text-[#14213D]/70">
              أوردرات اليوم فقط. تقدر تختار يوم سابق من التاريخ. أجر 75 جنيه على كل أوردر اتسلم.
            </p>
          ) : (
            <p className="text-xs font-bold text-[#14213D]/70">كل يوم حساب لوحده. المتبقي = المحصلة − الشحن − التوريد.</p>
          )}
        </div>
        {mode === "supervisor" ? (
          <Link href="/cs/mona-accounts" className="text-sm font-extrabold text-[#14213D] underline">
            كل المناديب
          </Link>
        ) : null}
      </div>
      {mode === "courier" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-extrabold text-[#14213D]">
            التاريخ
            <input
              type="date"
              value={courierDay}
              max={cairoToday()}
              onChange={(event) => setCourierDay(event.target.value || cairoToday())}
              className="mt-1 block h-11 rounded-xl border border-[#E5E5E5] bg-white px-3 text-sm font-bold"
            />
          </label>
          {courierDay !== cairoToday() ? (
            <button
              type="button"
              onClick={() => setCourierDay(cairoToday())}
              className="h-11 rounded-xl bg-[#14213D] px-4 text-sm font-extrabold text-white"
            >
              اليوم
            </button>
          ) : null}
        </div>
      ) : null}
      {mode === "supervisor" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("sheet")}
            className={`rounded-xl px-4 py-2 text-sm font-extrabold ${tab === "sheet" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"}`}
          >
            الحساب
          </button>
          <button
            type="button"
            onClick={() => setTab("report")}
            className={`rounded-xl px-4 py-2 text-sm font-extrabold ${tab === "report" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"}`}
          >
            التقرير
          </button>
        </div>
      ) : null}
      {message ? <p className="text-sm font-extrabold text-[#14213D]">{message}</p> : null}
      {loading && !desk ? <p className="text-sm font-bold text-[#14213D]/70">جاري التحميل</p> : null}
      {mode === "supervisor" && desk && !focused ? (
        <p className="text-sm font-bold text-[#14213D]/70">المندوب مش موجود.</p>
      ) : null}
      {mode === "supervisor" && tab === "sheet" && focused ? (
        <form className="flex flex-wrap items-end gap-2">
          <input
            value={sheetQuery}
            onChange={(event) => setSheetQuery(event.target.value)}
            placeholder="بحث: موبايل، اسم، عنوان، منتج..."
            className="h-10 min-w-[16rem] flex-1 rounded-xl border border-[#14213D]/15 bg-[#F5F5F0] px-3 text-sm font-bold text-[#14213D]"
          />
          <AccountDateField label="اليوم" value={sheetDay} onChange={setSheetDay} />
          <AccountDateField label="إلى" value={sheetTo} onChange={setSheetTo} />
        </form>
      ) : null}
      {mode === "supervisor" && tab === "sheet" && focused ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void post({ action: "assign", orderNumber, courierId: focused.id });
          }}
        >
          <input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            inputMode="numeric"
            placeholder="رقم الأوردر"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#14213D]/15 px-3 text-sm font-bold text-[#14213D]"
          />
          <button type="submit" className="rounded-xl bg-[#14213D] px-4 py-2 text-sm font-extrabold text-white">
            إضافة
          </button>
        </form>
      ) : null}
      {mode === "supervisor" && tab === "sheet"
        ? (desk?.ledger || [])
            .filter((line) => !focused || line.courierId === focused.id)
            .map((line) => (
              <CourierInvoice
                key={line.courierId}
                line={line}
                orders={orders}
                canEditMoney={Boolean(desk?.canEditMoney)}
                dayAccounts={focusedAccounts}
                drafts={dayDrafts}
                dayFrom={sheetDay}
                dayTo={sheetTo}
                query={sheetQuery}
                onInvoice={(confirmationId, invoiceNumber) => {
                  setDesk((current) => {
                    if (!current) return current;
                    return {
                      ...current,
                      orders: current.orders.map((order) =>
                        order.id === confirmationId ? { ...order, invoiceNumber } : order,
                      ),
                    };
                  });
                }}
                onDraft={(dayYmd, next) => setDayDrafts((current) => ({ ...current, [dayYmd]: next }))}
                onSaveDay={(dayYmd, amounts) => {
                  void post({
                    action: "day",
                    courierId: line.courierId,
                    dayYmd,
                    collected: amounts.collected,
                    shipping: amounts.shipping,
                    remitted: amounts.remitted,
                  });
                }}
                onOfficial={(confirmationId, result) => {
                  const previous = orders.find((order) => order.id === confirmationId);
                  rememberOfficial(confirmationId, result, previous?.isLarge);
                  void post({ action: "official", confirmationId, outcome: result || "clear" }).then((ok) => {
                    if (ok || !previous) return;
                    rememberOfficial(confirmationId, previous.official, previous.isLarge);
                  });
                }}
                onLarge={(confirmationId, isLarge) => void post({ action: "large", confirmationId, isLarge })}
                onUnassign={(confirmationId) => void post({ action: "unassign", confirmationId, courierId: line.courierId })}
              />
            ))
        : null}
      {mode === "supervisor" && tab === "report" && focused ? (
        <div className="grid gap-3">
          <form className="flex flex-wrap items-end gap-2">
            <AccountDateField label="من" value={fromDay} onChange={setFromDay} />
            <AccountDateField label="إلى" value={toDay} onChange={setToDay} />
          </form>
          <div className="overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {["اليوم", "قيمة البضاعة", "المحصلة", "الشحن", "التوريد", "المتبقي"].map((head) => (
                    <th key={head} className="border border-[#14213D]/25 bg-[#E5E5E5] px-2 py-2 text-right">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.length ? (
                  report.map((row) => (
                    <tr key={row.day}>
                      <td className="border border-[#14213D]/15 px-2 py-2 font-extrabold">{monaDayHeading(row.day)}</td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">{egp(row.goods)}</td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">
                        {row.collected == null ? "—" : egp(row.collected)}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">{egp(row.shipping)}</td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">
                        {row.remitted == null ? "—" : egp(row.remitted)}
                      </td>
                      <td className="border border-[#14213D]/15 px-2 py-2 text-center tabular-nums">{egp(row.remaining)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="border border-[#14213D]/15 px-3 py-6 text-center font-bold text-[#14213D]/60">
                      مفيش أيام في الفترة دي.
                    </td>
                  </tr>
                )}
              </tbody>
              {report.length ? (
                <tfoot>
                  <tr>
                    <td className="border border-[#14213D] bg-[#14213D] px-2 py-2 font-extrabold text-white">إجمالي الفترة</td>
                    <td className="border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                      {egp(reportTotal.goods)}
                    </td>
                    <td className="border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                      {egp(reportTotal.collected)}
                    </td>
                    <td className="border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                      {egp(reportTotal.shipping)}
                    </td>
                    <td className="border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                      {egp(reportTotal.remitted)}
                    </td>
                    <td className="border border-white/20 bg-[#14213D] px-2 py-2 text-center font-extrabold tabular-nums text-white">
                      {egp(reportTotal.remaining)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      ) : null}
      {mode === "courier" && desk?.ledger[0] ? (
        <p className="text-sm font-extrabold text-[#14213D]">
          مسلّم {desk.ledger[0].delivered} · مؤجّل {desk.ledger[0].postponed} · رفض {desk.ledger[0].refused} · التحصيل{" "}
          {egp(desk.ledger[0].collected)} · الأجر {egp(desk.ledger[0].fee)} · المتبقي {egp(desk.ledger[0].remaining)}
        </p>
      ) : null}
      {mode === "courier" ? (
        <div className="grid gap-3">
          {orders.map((order) => (
            <CourierCard key={order.id} order={order} onPost={post} canAct />
          ))}
        </div>
      ) : null}
      {mode === "courier" && desk && !orders.length ? (
        <p className="text-sm font-bold text-[#14213D]/70">مفيش أوردرات في اليوم ده.</p>
      ) : null}
    </section>
  );
}

export function MonaAccountsHome() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/cs/mona-couriers");
    const data = (await res.json()) as Desk | { message?: string };
    setLoading(false);
    if (!res.ok || !("couriers" in data)) {
      setMessage(("message" in data && data.message) || "تعذر تحميل المناديب.");
      return;
    }
    setDesk(data);
    setMessage("");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/cs/mona-couriers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    setMessage(data?.message || (res.ok ? "تم." : "تعذر التنفيذ."));
    if (res.ok) await load();
  }

  const couriers = desk?.couriers || [];

  return (
    <section className="no-print grid gap-3 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10 sm:p-4">
      <h2 className="text-base font-extrabold text-[#14213D]">مناديب المشرفة</h2>
      {message ? <p className="text-sm font-extrabold text-[#14213D]">{message}</p> : null}
      {loading && !desk ? <p className="text-sm font-bold text-[#14213D]/70">جاري التحميل</p> : null}
      {desk && !couriers.length ? (
        <p className="text-sm font-bold text-[#14213D]/70">أضف الحساب من المستخدمين بدور مندوب المشرفة.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {couriers.map((courier) => (
            <Link
              key={courier.id}
              href={`/cs/mona-accounts/${courier.id}`}
              className="rounded-2xl bg-[#14213D] px-4 py-5 text-lg font-extrabold text-white"
            >
              حساب {courier.name}
            </Link>
          ))}
        </div>
      )}
      {(desk?.returned || []).length ? (
        <section className="grid gap-2">
          <h3 className="text-sm font-extrabold text-orange-800">مؤجل — يتوزع على مندوب تاني</h3>
          {(desk?.returned || []).map((order) => (
            <ReturnedOrder
              key={order.id}
              order={order}
              couriers={couriers}
              onAssign={(courier) => void post({ action: "assign", orderNumber: order.wooOrderNumber, courierId: courier })}
            />
          ))}
        </section>
      ) : null}
    </section>
  );
}
