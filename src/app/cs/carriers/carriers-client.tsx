"use client";

import { useState } from "react";

import type { SokanyCarrier } from "@/lib/cs/sokany-waybill-types";

export function CarriersClient({ initialCarriers }: { initialCarriers: SokanyCarrier[] }) {
  const [carriers, setCarriers] = useState(initialCarriers);
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [hub, setHub] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/cs/carriers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, nameAr, printHubLabel: hub }),
    });
    const data = (await res.json()) as { message?: string; carrier?: SokanyCarrier };
    setBusy(false);
    if (!res.ok || !data.carrier) {
      setMessage(data.message || "تعذر الحفظ.");
      return;
    }
    setCarriers((prev) => [...prev, data.carrier!]);
    setCode("");
    setNameAr("");
    setHub("");
    setMessage("اتضافت الشركة. اختاريها من قائمة الأوردرات بعد حفظ المكالمة تطبعي بوليصة سوكانى.");
  }

  return (
    <main dir="rtl" className="mx-auto max-w-3xl p-4 text-[#14213D]">
      <h1 className="text-xl font-black">شركات الشحن</h1>
      <p className="mt-1 text-sm font-bold text-[#14213D]/70">
        بوسطة وتميمة وعيد ومؤمن يطبعوا من بوسطة حتى الاعتماد. أي شركة جديدة هنا تاخد بوليصة سوكانى.
      </p>
      <ul className="mt-4 space-y-2">
        {carriers.map((carrier) => (
          <li key={carrier.code} className="rounded-xl bg-white p-3 ring-1 ring-[#14213D]/10">
            <p className="font-extrabold">
              {carrier.nameAr} <span className="text-xs font-bold text-[#14213D]/55">({carrier.code})</span>
            </p>
            <p className="text-xs font-bold">
              البوليصة: {carrier.waybillProvider === "bosta" ? "بوسطة" : "سوكانى"} · {carrier.printHubLabel}
            </p>
          </li>
        ))}
      </ul>
      <form
        className="mt-6 space-y-2 rounded-2xl bg-[#FCA311]/15 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="font-extrabold">إضافة شركة / مندوب</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="كود إنجليزي مثل aramex"
          className="w-full rounded-lg bg-white px-3 py-2 text-sm font-bold ring-1 ring-[#14213D]/15"
        />
        <input
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          placeholder="الاسم بالعربي"
          className="w-full rounded-lg bg-white px-3 py-2 text-sm font-bold ring-1 ring-[#14213D]/15"
        />
        <input
          value={hub}
          onChange={(e) => setHub(e.target.value)}
          placeholder="اسم يظهر على البوليصة (اختياري)"
          className="w-full rounded-lg bg-white px-3 py-2 text-sm font-bold ring-1 ring-[#14213D]/15"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-[#14213D] px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy ? "جاري الحفظ…" : "حفظ الشركة"}
        </button>
        {message ? <p className="text-sm font-bold">{message}</p> : null}
      </form>
    </main>
  );
}
