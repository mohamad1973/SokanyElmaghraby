"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
  delivered: boolean;
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
};

type CourierData = { mode: "courier"; orders: OrderCard[] };

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
      <p className="font-bold">
        {[order.governorate, order.area].filter(Boolean).join(" · ") || "منطقة غير مسجلة"}
      </p>
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
      {order.total ? <p className="font-extrabold">{order.total} ج.م</p> : null}
    </div>
  );
}

export function CouriersClient({ mode }: { mode: "supervisor" | "courier" }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [supervisor, setSupervisor] = useState<SupervisorData | null>(null);
  const [mine, setMine] = useState<OrderCard[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [areaDraft, setAreaDraft] = useState("");
  const [orderNumber, setOrderNumber] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/cs/courier-dispatch");
    const data = (await res.json()) as SupervisorData | CourierData | { message?: string };
    setLoading(false);
    if (!res.ok || !("mode" in data)) {
      setMessage(("message" in data && data.message) || "تعذر تحميل الأوردرات.");
      return;
    }
    setMessage("");
    if (data.mode === "courier") setMine(data.orders);
    else setSupervisor(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = supervisor?.couriers.find((courier) => courier.id === selectedId) || null;
  const matching = useMemo(
    () => (selected ? (supervisor?.pool || []).filter((order) => order.matches.includes(selected.id)) : []),
    [selected, supervisor],
  );
  const others = useMemo(
    () => (selected ? (supervisor?.pool || []).filter((order) => !order.matches.includes(selected.id)) : supervisor?.pool || []),
    [selected, supervisor],
  );

  async function post(body: Record<string, unknown>) {
    setMessage("");
    const res = await fetch("/api/cs/courier-dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { message?: string };
    if (!res.ok) {
      setMessage(data.message || "تعذر الحفظ.");
      return;
    }
    await load();
  }

  async function addArea(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const next = areaDraft.trim();
    if (!next) return;
    setAreaDraft("");
    await post({ action: "areas", courierId: selected.id, areas: [...selected.areas, next] });
  }

  if (mode === "courier") {
    return (
      <div className="mx-auto grid max-w-3xl gap-3">
        <h1 className="text-xl font-extrabold text-[#14213D]">أوردراتي</h1>
        {message ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{message}</p> : null}
        {loading ? <p className="text-sm font-bold text-[#14213D]/60">جاري التحميل…</p> : null}
        {!loading && mine.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70 shadow">مفيش أوردرات موزعة لك النهاردة.</p>
        ) : null}
        {mine.map((order) => (
          <article key={order.id} className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <OrderDetails order={order} />
            <button
              type="button"
              disabled={order.delivered}
              onClick={() => void post({ action: "deliver", confirmationId: order.id })}
              className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white disabled:bg-[#E5E5E5] disabled:text-[#14213D]"
            >
              {order.delivered ? "اتعلم تم التسليم" : "تم التسليم"}
            </button>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <h1 className="text-xl font-extrabold text-[#14213D]">توزيع المناديب</h1>
      <p className="text-xs font-bold text-[#14213D]/60">
        أوردرات شيت سيد تميمة اللي اتأكدت النهاردة. التعليم على أوردر يطلعه من القائمة ويبعته للمندوب المختار.
      </p>
      {message ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{message}</p> : null}
      {loading ? <p className="text-sm font-bold text-[#14213D]/60">جاري التحميل…</p> : null}

      <div className="grid gap-2">
        {(supervisor?.couriers || []).length === 0 && !loading ? (
          <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70 shadow">
            لسه مفيش مندوب. من صفحة المستخدمين اعمل حساب بصلاحية مندوب.
          </p>
        ) : null}
        {(supervisor?.couriers || []).map((courier) => (
          <button
            key={courier.id}
            type="button"
            onClick={() => setSelectedId(courier.id)}
            className={`rounded-2xl p-3 text-right shadow ring-1 ${
              selectedId === courier.id ? "bg-[#14213D] text-white ring-[#14213D]" : "bg-white text-[#14213D] ring-[#14213D]/10"
            }`}
          >
            <span className="block font-extrabold">{courier.name}</span>
            <span className="mt-1 block text-xs font-bold opacity-80">
              {courier.areas.length ? courier.areas.join(" · ") : "لسه مفيش مناطق"}
            </span>
          </button>
        ))}
      </div>

      {selected ? (
        <form onSubmit={(event) => void addArea(event)} className="grid gap-2 rounded-2xl bg-white p-4 shadow">
          <p className="text-sm font-extrabold text-[#14213D]">مناطق {selected.name}</p>
          <div className="flex flex-wrap gap-2">
            {selected.areas.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => void post({ action: "areas", courierId: selected.id, areas: selected.areas.filter((item) => item !== area) })}
                className="rounded-full bg-[#E5E5E5] px-3 py-1 text-xs font-extrabold text-[#14213D]"
              >
                {area} ×
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(supervisor?.areaOptions || [])
              .filter((area) => !selected.areas.includes(area))
              .slice(0, 24)
              .map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => void post({ action: "areas", courierId: selected.id, areas: [...selected.areas, area] })}
                  className="rounded-full border border-[#14213D]/20 px-3 py-1 text-xs font-bold text-[#14213D]"
                >
                  {area}
                </button>
              ))}
          </div>
          <div className="flex gap-2">
            <input
              value={areaDraft}
              onChange={(event) => setAreaDraft(event.target.value)}
              placeholder="منطقة جديدة"
              className="min-w-0 flex-1 rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
            />
            <button type="submit" className="rounded-xl bg-[#FCA311] px-3 py-2 text-sm font-extrabold text-black">
              أضف
            </button>
          </div>
        </form>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!selected) {
            setMessage("اختار المندوب الأول.");
            return;
          }
          void post({ action: "assign", courierId: selected.id, orderNumber });
          setOrderNumber("");
        }}
        className="flex gap-2"
      >
        <input
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          placeholder="رقم الأوردر"
          className="min-w-0 flex-1 rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm font-bold"
        />
        <button type="submit" className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white">
          توزيع بالرقم
        </button>
      </form>

      {selected ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-extrabold text-[#14213D]">مناطق {selected.name}</h2>
          {matching.length === 0 ? <p className="text-xs font-bold text-[#14213D]/60">مفيش أوردر في مناطق المندوب ده.</p> : null}
          {matching.map((order) => (
            <label key={order.id} className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 shadow">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-[#FCA311]"
                onChange={() => void post({ action: "assign", confirmationId: order.id, courierId: selected.id })}
              />
              <OrderDetails order={order} />
            </label>
          ))}
        </section>
      ) : null}

      <section className="grid gap-2">
        <h2 className="text-sm font-extrabold text-[#14213D]">{selected ? "باقي أوردرات اليوم" : "أوردرات اليوم"}</h2>
        {others.length === 0 && !loading ? <p className="text-xs font-bold text-[#14213D]/60">مفيش أوردرات فاضية.</p> : null}
        {others.map((order) => (
          <label key={order.id} className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-[#FCA311]"
              disabled={!selected}
              onChange={() => selected && void post({ action: "assign", confirmationId: order.id, courierId: selected.id })}
            />
            <OrderDetails order={order} />
          </label>
        ))}
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-extrabold text-[#14213D]">اتوزع النهاردة</h2>
        {(supervisor?.assigned || []).length === 0 && !loading ? (
          <p className="text-xs font-bold text-[#14213D]/60">لسه مفيش توزيع.</p>
        ) : null}
        {(supervisor?.assigned || []).map((order) => (
          <article key={order.id} className="grid gap-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <p className="text-xs font-extrabold text-[#FCA311]">{order.courierName}</p>
            <OrderDetails order={order} />
            <button
              type="button"
              onClick={() => void post({ action: "unassign", confirmationId: order.id })}
              className="justify-self-start rounded-xl border border-[#14213D]/20 px-3 py-1.5 text-xs font-extrabold text-[#14213D]"
            >
              إرجاع للقائمة
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
