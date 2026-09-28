"use client";

import { useCallback, useEffect, useState } from "react";

import { cairoTodayYmd } from "@/lib/cs/order-window";

import { TrackingScanBox } from "../tracking-scan";

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
  delivered: boolean;
  outcome: "delivered" | "refused" | "postponed" | null;
  refusalReason: string;
  courierId: number | null;
  courierName: string;
  matches: number[];
};

type CourierRow = { id: number; name: string; areas: string[] };
type SupervisorData = {
  mode: "supervisor";
  couriers: CourierRow[];
  areaOptions: string[];
  pool: OrderCard[];
  assigned: OrderCard[];
  collected: Array<{ courierId: number; amount: number }>;
};
type CourierData = { mode: "courier"; orders: OrderCard[] };

function OrderDetails({ order }: { order: OrderCard }) {
  return (
    <div className="grid gap-1 text-sm text-[#14213D]">
      <p className="text-base font-extrabold">#{order.wooOrderNumber} · {order.customerName || "—"}</p>
      <p className="font-bold">{order.phone || "—"}{order.altPhone ? ` · ${order.altPhone}` : ""}</p>
      <p className="font-bold">{[order.governorate, order.area].filter(Boolean).join(" · ") || "منطقة غير مسجلة"}</p>
      <p>{order.address || "—"}</p>
      {order.landmarks ? <p className="text-[#14213D]/70">علامات: {order.landmarks}</p> : null}
      {order.items.length ? (
        <ul className="list-disc pr-4 text-xs font-bold">
          {order.items.map((item) => (
            <li key={`${item.name}-${item.quantity}`}>{item.name} × {item.quantity}</li>
          ))}
        </ul>
      ) : null}
      {order.total ? <p className="font-extrabold">{order.total} ج.م</p> : null}
    </div>
  );
}

function CourierCard({ order, onPost }: { order: OrderCard; onPost: (body: Record<string, unknown>) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [askingRefuse, setAskingRefuse] = useState(false);
  const tone =
    order.outcome === "delivered" ? "bg-emerald-100 ring-emerald-600"
    : order.outcome === "refused" ? "bg-red-100 ring-red-600"
    : order.outcome === "postponed" ? "bg-orange-100 ring-orange-500"
    : "bg-white ring-[#14213D]/10";
  const locked = order.outcome === "delivered";
  return (
    <article className={`grid gap-3 rounded-2xl p-4 shadow ring-1 ${tone}`}>
      <OrderDetails order={order} />
      {order.outcome === "delivered" ? <p className="text-base font-extrabold text-emerald-800">تم بنجاح</p> : null}
      {order.outcome === "refused" ? <p className="text-sm font-extrabold text-red-800">تم الرفض{order.refusalReason ? `: ${order.refusalReason}` : ""}</p> : null}
      {order.outcome === "postponed" ? <p className="text-sm font-extrabold text-orange-800">تأجيل</p> : null}
      {locked ? null : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void onPost({ action: "deliver", confirmationId: order.id, outcome: "delivered" })} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-extrabold text-white">تم التسليم</button>
          <button type="button" onClick={() => setAskingRefuse((open) => !open)} className="rounded-xl bg-red-700 px-3 py-2 text-sm font-extrabold text-white">رفض الاستلام</button>
          <button type="button" onClick={() => void onPost({ action: "deliver", confirmationId: order.id, outcome: "postponed" })} className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-extrabold text-black">تأجيل</button>
        </div>
      )}
      {askingRefuse && !locked ? (
        <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void onPost({ action: "deliver", confirmationId: order.id, outcome: "refused", reason }); }}>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب الرفض" className="h-10 min-w-0 flex-1 rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-[#14213D]" />
          <button type="submit" className="rounded-xl bg-red-700 px-3 py-2 text-sm font-extrabold text-white">حفظ الرفض</button>
        </form>
      ) : null}
    </article>
  );
}

export function CouriersClient({ mode }: { mode: "supervisor" | "courier" | "admin" }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [supervisor, setSupervisor] = useState<SupervisorData | null>(null);
  const [mine, setMine] = useState<OrderCard[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [collectedDraft, setCollectedDraft] = useState("");
  const [day, setDay] = useState(cairoTodayYmd());
  const load = useCallback(async () => {
    setLoading(true);
    if (mode === "admin") {
      const rosterRes = await fetch("/api/cs/courier-dispatch");
      const roster = (await rosterRes.json()) as SupervisorData | { message?: string };
      if (!rosterRes.ok || !("mode" in roster) || roster.mode !== "supervisor") {
        setLoading(false);
        setMessage(("message" in roster && roster.message) || "تعذر تحميل المناديب.");
        return;
      }
      setSupervisor(roster);
      if (!selectedId) {
        setMine([]);
        setLoading(false);
        setMessage("");
        return;
      }
      const res = await fetch(`/api/cs/courier-dispatch?courierId=${selectedId}&day=${encodeURIComponent(day)}`);
      const data = (await res.json()) as CourierData | { message?: string };
      setLoading(false);
      if (!res.ok || !("mode" in data) || data.mode !== "courier") {
        setMessage(("message" in data && data.message) || "تعذر تحميل أوردرات المندوب.");
        return;
      }
      setMessage("");
      setMine(data.orders);
      return;
    }
    const res = await fetch(mode === "courier" ? `/api/cs/courier-dispatch?day=${encodeURIComponent(day)}` : "/api/cs/courier-dispatch");
    const data = (await res.json()) as SupervisorData | CourierData | { message?: string };
    setLoading(false);
    if (!res.ok || !("mode" in data)) {
      setMessage(("message" in data && data.message) || "تعذر تحميل الأوردرات.");
      return;
    }
    setMessage("");
    if (data.mode === "courier") setMine(data.orders);
    else setSupervisor(data);
  }, [mode, selectedId, day]);
  useEffect(() => { void load(); }, [load]);
  const selected = supervisor?.couriers.find((courier) => courier.id === selectedId) || null;
  async function post(body: Record<string, unknown>) {
    setMessage("");
    const payload = mode === "admin" && selectedId && body.action === "deliver" ? { ...body, courierId: selectedId } : body;
    const res = await fetch("/api/cs/courier-dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = (await res.json()) as { message?: string };
    if (!res.ok) { setMessage(data.message || "تعذر الحفظ."); return; }
    await load();
  }
  if (mode === "courier" || mode === "admin") {
    return (
      <div className="mx-auto grid max-w-3xl gap-3">
        <h1 className="text-xl font-extrabold text-[#14213D]">{mode === "admin" ? "المندوب" : "أوردراتي"}</h1>
        <label className="flex items-center gap-2 text-sm font-extrabold text-[#14213D]">
          التاريخ
          <input type="date" value={day} onChange={(event) => setDay(event.target.value)} className="h-11 rounded-xl border border-[#E5E5E5] bg-white px-3" />
        </label>
        {mode === "courier" || selectedId ? (
          <TrackingScanBox
            action="deliver"
            courierId={mode === "admin" ? selectedId : undefined}
            title="تسليم بالسكان"
            hint="امسح تراك بوسطة أو اكتبه. تقدر برضو تختار الأوردر من القائمة تحت."
          />
        ) : null}
        {mode === "admin" ? (
          <select
            value={selectedId ? String(selectedId) : ""}
            onChange={(event) => setSelectedId(event.target.value ? Number(event.target.value) : null)}
            className="h-11 rounded-xl border border-[#E5E5E5] bg-white px-3 text-sm font-extrabold text-[#14213D]"
          >
            <option value="">اختر المندوب</option>
            {(supervisor?.couriers || []).map((courier) => (
              <option key={courier.id} value={String(courier.id)}>{courier.name}</option>
            ))}
          </select>
        ) : null}
        {message ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{message}</p> : null}
        {loading ? <p className="text-sm font-bold text-[#14213D]/60">جاري التحميل…</p> : null}
        {mode === "admin" && !selectedId && !loading ? <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70 shadow">اختار المندوب عشان تشوف أوردراته.</p> : null}
        {!loading && (mode === "courier" || selectedId) && mine.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70 shadow">
            مفيش أوردرات موزعة {mode === "admin" ? "للمندوب ده" : "لك"} في اليوم ده.
          </p>
        ) : null}
        {mine.map((order) => <CourierCard key={order.id} order={order} onPost={post} />)}
      </div>
    );
  }
  const collectedTotal = (supervisor?.collected || []).reduce((sum, row) => sum + row.amount, 0);
  const selectedOrders = (supervisor?.assigned || []).filter((order) => order.courierId === selectedId);
  const selectedDue = selectedOrders
    .filter((order) => order.outcome === "delivered")
    .reduce((sum, order) => sum + order.cashAmount, 0);
  const money = (value: number) => value.toLocaleString("ar-EG");
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <h1 className="text-xl font-extrabold text-[#14213D]">توزيع المناديب</h1>
      <p className="rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white">
        إجمالي النقدية المحصّلة النهاردة: {money(collectedTotal)} ج.م
      </p>
      <p className="text-xs font-bold text-[#14213D]/60">اختار المندوب ثم علّم على الأوردرات اللي تخصه. التعليم يطلّع الأوردر من القائمة ويبعته للمندوب.</p>
      {message ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{message}</p> : null}
      {loading ? <p className="text-sm font-bold text-[#14213D]/60">جاري التحميل…</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {(supervisor?.couriers || []).length === 0 && !loading ? <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70 shadow">لسه مفيش مندوب. من صفحة المستخدمين اعمل حساب بصلاحية مندوب.</p> : null}
        {(supervisor?.couriers || []).map((courier) => (
          <button
            key={courier.id}
            type="button"
            onClick={() => {
              setSelectedId(courier.id);
              const saved = supervisor?.collected.find((row) => row.courierId === courier.id)?.amount;
              setCollectedDraft(saved ? String(saved) : "");
            }}
            className={`rounded-2xl p-3 text-right shadow ring-1 ${selectedId === courier.id ? "bg-[#14213D] text-white ring-[#14213D]" : "bg-white text-[#14213D] ring-[#14213D]/10"}`}
          >
            <span className="block font-extrabold">{courier.name}</span>
          </button>
        ))}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); if (!selected) { setMessage("اختار المندوب الأول."); return; } void post({ action: "assign", courierId: selected.id, orderNumber }); setOrderNumber(""); }} className="flex gap-2">
        <input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="رقم الأوردر" className="min-w-0 flex-1 rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm font-bold" />
        <button type="submit" className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white">توزيع برقم الأوردر</button>
      </form>
      <section className="grid gap-2">
        <h2 className="text-sm font-extrabold text-[#14213D]">{selected ? `أوردرات ${selected.name}` : "اختار المندوب ثم علّم على أوردراته"}</h2>
        {(supervisor?.pool || []).map((order) => (
          <label key={order.id} className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <input type="checkbox" className="mt-1 size-5 accent-[#FCA311]" disabled={!selected} onChange={() => selected && void post({ action: "assign", confirmationId: order.id, courierId: selected.id })} />
            <OrderDetails order={order} />
          </label>
        ))}
      </section>
      {selected ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void post({ action: "collect", courierId: selected.id, amount: collectedDraft === "" ? 0 : Number(collectedDraft) });
          }}
          className="grid gap-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        >
          <p className="text-sm font-extrabold text-[#14213D]">مستحق {selected.name} من المسلّم: {money(selectedDue)} ج.م</p>
          <label className="text-xs font-bold text-[#14213D]">
            المحصّل النهاردة
            <input
              value={collectedDraft}
              onChange={(event) => setCollectedDraft(event.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              className="mt-1 h-10 w-full rounded-xl border border-[#E5E5E5] bg-white px-3 text-sm font-bold"
            />
          </label>
          <button type="submit" className="h-10 rounded-xl bg-[#FCA311] px-3 text-sm font-extrabold text-black">حفظ التحصيل</button>
        </form>
      ) : null}
      <section className="grid gap-2">
        <h2 className="text-sm font-extrabold text-[#14213D]">اتوزع النهاردة</h2>
        {(supervisor?.assigned || []).map((order) => (
          <article key={order.id} className="grid gap-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <p className="text-xs font-extrabold text-[#FCA311]">{order.courierName}</p>
            <OrderDetails order={order} />
            <p className="text-sm font-extrabold text-[#14213D]">نقد: {money(order.cashAmount)} ج.م</p>
            {order.outcome === "delivered" ? <p className="text-sm font-extrabold text-emerald-800">تم التسليم</p> : null}
            {order.outcome === "refused" ? <p className="text-sm font-extrabold text-red-800">ملغى</p> : null}
            {order.outcome === "postponed" ? <p className="text-sm font-extrabold text-orange-800">تأجيل</p> : null}
            {selected && order.courierId === selected.id ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void post({ action: "disposition", confirmationId: order.id, courierId: selected.id, outcome: "postponed" })} className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-extrabold text-black">تأجيل</button>
                <button type="button" onClick={() => void post({ action: "disposition", confirmationId: order.id, courierId: selected.id, outcome: "refused" })} className="rounded-xl bg-red-700 px-3 py-2 text-xs font-extrabold text-white">ملغى</button>
              </div>
            ) : null}
            <button type="button" onClick={() => void post({ action: "unassign", confirmationId: order.id })} className="justify-self-start rounded-xl border border-[#14213D]/20 px-3 py-1.5 text-xs font-extrabold text-[#14213D]">إرجاع للتوزيع</button>
          </article>
        ))}
      </section>
    </div>
  );
}
