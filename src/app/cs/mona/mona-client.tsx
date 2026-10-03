"use client";

import { useCallback, useEffect, useState } from "react";

type Outcome = "delivered" | "refused" | "postponed";

type OrderCard = {
  id: number;
  wooOrderNumber: string;
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
  refusalReason: string;
  courierId: number | null;
  courierName: string;
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

type Desk = {
  mode: "supervisor" | "courier";
  canEditMoney?: boolean;
  couriers: Array<{ id: number; name: string }>;
  orders: OrderCard[];
  ledger: LedgerLine[];
};

type MoneyDraft = { collected: string; shipping: string; remitted: string };

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

function invoiceLines(order: OrderCard) {
  if (!order.items.length) {
    return [{ key: `${order.id}-0`, product: "—", quantity: 1, price: order.cashAmount, value: order.cashAmount }];
  }
  return order.items.map((item, index) => ({
    key: `${order.id}-${index}`,
    product: item.name,
    quantity: item.quantity,
    price: item.price,
    value: item.lineTotal || item.price * item.quantity,
  }));
}

function CourierInvoice({
  line,
  orders,
  canEditMoney,
  draft,
  onDraft,
  onSave,
}: {
  line: LedgerLine;
  orders: OrderCard[];
  canEditMoney: boolean;
  draft: MoneyDraft;
  onDraft: (next: MoneyDraft) => void;
  onSave: () => void;
}) {
  const mine = orders.filter((order) => Number(order.courierId) === Number(line.courierId));
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-[#14213D]/15">
      <header className="flex items-center justify-between gap-3 bg-[#14213D] px-4 py-3 text-white">
        <h3 className="text-lg font-extrabold">حساب {line.name}</h3>
        <p className="text-xs font-bold text-[#FCA311]">
          مسلّم {line.delivered} · مؤجّل {line.postponed} · رفض {line.refused}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-right text-sm text-[#14213D]">
          <thead className="bg-[#F8F4EA] text-xs font-extrabold">
            <tr>
              {["رقم الأوردر", "العميل", "التليفون", "العنوان", "المنتج", "الكمية", "السعر", "القيمة", "الحالة"].map((head) => (
                <th key={head} className="border-b border-[#14213D]/10 px-2 py-2">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mine.length ? (
              mine.flatMap((order) => {
                const lines = invoiceLines(order);
                return lines.map((row, index) => (
                  <tr key={row.key} className="border-b border-[#14213D]/10">
                    {index === 0 ? (
                      <>
                        <td className="px-2 py-2 font-extrabold" rowSpan={lines.length}>
                          #{order.wooOrderNumber}
                        </td>
                        <td className="px-2 py-2" rowSpan={lines.length}>
                          {order.customerName || "—"}
                        </td>
                        <td className="px-2 py-2" dir="ltr" rowSpan={lines.length}>
                          {order.phone || "—"}
                        </td>
                        <td className="px-2 py-2" rowSpan={lines.length}>
                          {order.address || "—"}
                        </td>
                      </>
                    ) : null}
                    <td className="px-2 py-2">{row.product}</td>
                    <td className="px-2 py-2">{row.quantity}</td>
                    <td className="px-2 py-2">{egp(row.price)}</td>
                    <td className="px-2 py-2 font-extrabold">{egp(row.value)}</td>
                    {index === 0 ? (
                      <td className="px-2 py-2 font-extrabold" rowSpan={lines.length}>
                        {orderState(order)}
                      </td>
                    ) : null}
                  </tr>
                ));
              })
            ) : (
              <tr>
                <td className="px-3 py-6 text-center font-bold text-[#14213D]/60" colSpan={9}>
                  مفيش أوردرات عند المندوب.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="grid gap-2 border-t border-[#14213D]/10 bg-[#F8F4EA] px-4 py-3 text-sm font-extrabold text-[#14213D]">
        <p className="flex items-center justify-between gap-3">
          <span>إجمالي قيمة البضاعة</span>
          <span>{egp(line.goods)} ج.م</span>
        </p>
        {canEditMoney ? (
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
                value={draft.collected}
                onChange={(event) => onDraft({ ...draft, collected: event.target.value })}
                inputMode="decimal"
                className="h-9 w-36 rounded-lg border border-[#14213D]/15 bg-white px-2 text-left font-bold"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>إجمالي تكلفة الشحن</span>
              <input
                value={draft.shipping}
                onChange={(event) => onDraft({ ...draft, shipping: event.target.value })}
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
              <span>{egp(line.invoiceRemaining)} ج.م</span>
            </p>
            <button type="submit" className="h-10 rounded-xl bg-[#FCA311] text-sm font-extrabold text-black">
              حفظ
            </button>
          </form>
        ) : (
          <>
            <p className="flex items-center justify-between gap-3">
              <span>القيمة المحصلة</span>
              <span>{egp(line.invoiceCollected)} ج.م</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span>إجمالي تكلفة الشحن</span>
              <span>{egp(line.invoiceShipping)} ج.م</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span>التوريد النقدي</span>
              <span>{egp(line.invoiceRemitted)} ج.م</span>
            </p>
            <p className="flex items-center justify-between gap-3 text-base">
              <span>المتبقي</span>
              <span>{egp(line.invoiceRemaining)} ج.م</span>
            </p>
          </>
        )}
      </footer>
    </article>
  );
}

function OrderDetails({ order }: { order: OrderCard }) {
  return (
    <div className="grid gap-1 text-sm text-[#14213D]">
      <p className="text-base font-extrabold">
        #{order.wooOrderNumber} · {order.customerName || "—"}
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
  onPost: (body: Record<string, unknown>) => Promise<void>;
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

export function MonaCourierPanel({ mode }: { mode: "supervisor" | "courier" }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [orderNumber, setOrderNumber] = useState("");
  const [courierId, setCourierId] = useState("");
  const [moneyDrafts, setMoneyDrafts] = useState<Record<number, MoneyDraft>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(mode === "courier" ? "/api/cs/mona-couriers?scope=own" : "/api/cs/mona-couriers");
    const data = (await res.json()) as Desk | { message?: string };
    setLoading(false);
    if (!res.ok || !("orders" in data)) {
      setMessage(("message" in data && data.message) || "تعذر تحميل مناديب المشرفة.");
      return;
    }
    setDesk(data);
    setMoneyDrafts((current) => {
      const next = { ...current };
      for (const line of data.ledger || []) {
        next[line.courierId] = {
          collected: egp(line.invoiceCollected),
          shipping: egp(line.invoiceShipping),
          remitted: egp(line.invoiceRemitted),
        };
      }
      return next;
    });
    setMessage("");
  }, [mode]);

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
  const orders = desk?.orders || [];

  return (
    <section className="no-print grid gap-3 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10 sm:p-4">
      <div>
        <h2 className="text-base font-extrabold text-[#14213D]">مناديب المشرفة</h2>
        {mode === "courier" ? (
          <p className="text-xs font-bold text-[#14213D]/70">أجر 75 جنيه على كل أوردر اتسلم. المتبقي = التحصيل − الأجر − التوريد.</p>
        ) : (
          <p className="text-xs font-bold text-[#14213D]/70">المتبقي = المحصلة − الشحن − التوريد. تعديل الأرقام من حساب الأدمن.</p>
        )}
      </div>
      {message ? <p className="text-sm font-extrabold text-[#14213D]">{message}</p> : null}
      {mode === "supervisor" ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void post({ action: "assign", orderNumber, courierId: Number(courierId) });
          }}
        >
          <input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            inputMode="numeric"
            placeholder="رقم الأوردر"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#14213D]/15 px-3 text-sm font-bold text-[#14213D]"
          />
          <select
            value={courierId}
            onChange={(event) => setCourierId(event.target.value)}
            className="h-11 min-w-36 rounded-xl border border-[#14213D]/15 bg-white px-3 text-sm font-bold text-[#14213D]"
          >
            <option value="">اسم المندوب</option>
            {couriers.map((courier) => (
              <option key={courier.id} value={courier.id}>
                {courier.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-xl bg-[#14213D] px-4 py-2 text-sm font-extrabold text-white">
            إضافة
          </button>
        </form>
      ) : null}
      {loading && !desk ? <p className="text-sm font-bold text-[#14213D]/70">جاري التحميل</p> : null}
      {mode === "supervisor" && desk && !couriers.length ? (
        <p className="text-sm font-bold text-[#14213D]/70">أضف الحساب من المستخدمين بدور مندوب المشرفة.</p>
      ) : null}
      {mode === "supervisor"
        ? (desk?.ledger || []).map((line) => (
            <CourierInvoice
              key={line.courierId}
              line={line}
              orders={orders}
              canEditMoney={Boolean(desk?.canEditMoney)}
              draft={
                moneyDrafts[line.courierId] || {
                  collected: egp(line.invoiceCollected),
                  shipping: egp(line.invoiceShipping),
                  remitted: egp(line.invoiceRemitted),
                }
              }
              onDraft={(next) => setMoneyDrafts((current) => ({ ...current, [line.courierId]: next }))}
              onSave={() => {
                const draft = moneyDrafts[line.courierId];
                void post({
                  action: "adjust",
                  courierId: line.courierId,
                  collected: Number(draft?.collected),
                  shipping: Number(draft?.shipping),
                  remitted: Number(draft?.remitted),
                });
              }}
            />
          ))
        : null}
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
        <p className="text-sm font-bold text-[#14213D]/70">مفيش أوردرات عندك.</p>
      ) : null}
    </section>
  );
}
