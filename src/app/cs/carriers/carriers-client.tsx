"use client";

import { useState } from "react";

import type { SokanyCarrier } from "@/lib/cs/sokany-waybill-types";

const inputCls = "w-full rounded-lg bg-white px-3 py-2 text-sm font-bold ring-1 ring-[#14213D]/15";

export function CarriersClient({ initialCarriers }: { initialCarriers: SokanyCarrier[] }) {
  const [carriers, setCarriers] = useState(initialCarriers);
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [hub, setHub] = useState("");
  const [hubEdits, setHubEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingCode, setSavingCode] = useState("");

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

  async function saveHub(carrier: SokanyCarrier) {
    if (savingCode) return;
    const nextHub = (hubEdits[carrier.code] ?? carrier.printHubLabel).trim();
    setSavingCode(carrier.code);
    setMessage("");
    const res = await fetch("/api/cs/carriers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: carrier.code, printHubLabel: nextHub }),
    });
    const data = (await res.json()) as { message?: string; carrier?: SokanyCarrier };
    setSavingCode("");
    if (!res.ok || !data.carrier) {
      setMessage(data.message || "تعذر حفظ اسم البوليصة.");
      return;
    }
    setCarriers((prev) => prev.map((row) => (row.code === data.carrier!.code ? data.carrier! : row)));
    setHubEdits((prev) => {
      const next = { ...prev };
      delete next[carrier.code];
      return next;
    });
    setMessage("اتحفظ الاسم على بوليصة سوكانى.");
  }

  return (
    <main dir="rtl" className="mx-auto max-w-3xl p-4 text-[#14213D]">
      <h1 className="text-xl font-black">شركات الشحن</h1>
      <p className="mt-1 text-sm font-bold text-[#14213D]/70">
        تميمة وعيد ومؤمن والشركات الجديدة يطبعوا بوليصة سوكانى. عدّلي الاسم اللي يظهر في هيدر البوليصة. بوسطة للعرض فقط.
      </p>
      <ul className="mt-4 space-y-2">
        {carriers.map((carrier) => {
          const sokany = carrier.waybillProvider === "sokany";
          const hubValue = hubEdits[carrier.code] ?? carrier.printHubLabel;
          return (
            <li key={carrier.code} className="rounded-xl bg-white p-3 ring-1 ring-[#14213D]/10">
              <p className="font-extrabold">
                {carrier.nameAr} <span className="text-xs font-bold text-[#14213D]/55">({carrier.code})</span>
              </p>
              <p className="text-xs font-bold">
                البوليصة: {sokany ? "سوكانى" : "بوسطة"}
              </p>
              {sokany ? (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex-1 text-xs font-extrabold text-[#14213D]/70">
                    الاسم على بوليصة سوكانى
                    <input
                      value={hubValue}
                      onChange={(e) => setHubEdits((prev) => ({ ...prev, [carrier.code]: e.target.value }))}
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={Boolean(savingCode) || hubValue.trim() === carrier.printHubLabel.trim()}
                    onClick={() => void saveHub(carrier)}
                    className="rounded-xl bg-[#14213D] px-4 py-2 text-sm font-extrabold text-white disabled:opacity-40 sm:mt-5"
                  >
                    {savingCode === carrier.code ? "جاري الحفظ…" : "حفظ الاسم"}
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-xs font-bold text-[#14213D]/55">{carrier.printHubLabel}</p>
              )}
            </li>
          );
        })}
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
          className={inputCls}
        />
        <input
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          placeholder="الاسم بالعربي"
          className={inputCls}
        />
        <input
          value={hub}
          onChange={(e) => setHub(e.target.value)}
          placeholder="الاسم على بوليصة سوكانى (اختياري)"
          className={inputCls}
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
