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
  items: Array<{ name: string; quantity: number }>;
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
  collected: number;
  fee: number;
  remitted: number;
  remaining: number;
};

type Desk = {
  mode: "supervisor" | "courier";
  couriers: Array<{ id: number; name: string }>;
  orders: OrderCard[];
  ledger: LedgerLine[];
};

function egp(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
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
  const [remitDrafts, setRemitDrafts] = useState<Record<number, string>>({});

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
        <p className="text-xs font-bold text-[#14213D]/70">أجر 75 جنيه على كل أوردر اتسلم. المتبقي = التحصيل − الأجر − التوريد.</p>
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
            <article key={line.courierId} className="grid gap-2 rounded-2xl bg-[#F8F4EA] p-3 ring-1 ring-[#14213D]/10">
              <p className="text-base font-extrabold text-[#14213D]">{line.name}</p>
              {orders
                .filter((order) => Number(order.courierId) === Number(line.courierId))
                .map((order) => (
                  <CourierCard key={order.id} order={order} onPost={post} canAct={false} />
                ))}
              <p className="text-sm font-bold text-[#14213D]">
                مسلّم {line.delivered} · مؤجّل {line.postponed} · رفض {line.refused}
              </p>
              <p className="text-sm font-bold text-[#14213D]">
                التحصيل {egp(line.collected)} · الأجر {egp(line.fee)} · التوريد {egp(line.remitted)} · المتبقي {egp(line.remaining)}
              </p>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void post({ action: "remit", courierId: line.courierId, amount: Number(remitDrafts[line.courierId] || "") });
                }}
              >
                <input
                  value={remitDrafts[line.courierId] || ""}
                  onChange={(event) => setRemitDrafts((current) => ({ ...current, [line.courierId]: event.target.value }))}
                  inputMode="decimal"
                  placeholder="مبلغ التوريد"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[#14213D]/15 bg-white px-3 text-sm font-bold text-[#14213D]"
                />
                <button type="submit" className="rounded-xl bg-[#FCA311] px-3 py-2 text-sm font-extrabold text-black">
                  تسجيل التوريد
                </button>
              </form>
            </article>
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
