"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  CS_CHECKLIST_ITEMS,
  type CsChecklistAnswerInput,
  validateChecklistAnswers,
} from "@/lib/cs/checklist";

type Snapshot = {
  customerName?: string;
  phone?: string;
  address?: string;
  governorate?: string;
  area?: string;
  paymentMethod?: string;
  total?: string;
  currency?: string;
  number?: string;
  status?: string;
  freeShippingHint?: string;
  items?: Array<{ name: string; quantity: number; total: string; sku?: string }>;
};

type AnswerState = {
  confirmed: boolean;
  value: string;
  note: string;
  yesNo: "" | "yes" | "no";
};

type Props = {
  confirmationId: number;
  status: string;
  snapshot: Snapshot | null;
  initialAnswers: Array<{ itemKey: string; confirmed: boolean; value: string | null; note: string | null }>;
  readOnly?: boolean;
};

const CARD_TONES = [
  "from-teal-50 to-white ring-teal-200",
  "from-cyan-50 to-white ring-cyan-200",
  "from-sky-50 to-white ring-sky-200",
  "from-blue-50 to-white ring-blue-200",
  "from-indigo-50 to-white ring-indigo-200",
  "from-emerald-50 to-white ring-emerald-200",
  "from-lime-50 to-white ring-lime-200",
  "from-amber-50 to-white ring-amber-200",
  "from-orange-50 to-white ring-orange-200",
  "from-rose-50 to-white ring-rose-200",
  "from-fuchsia-50 to-white ring-fuchsia-200",
];

const TITLE_TONES = [
  "text-teal-800",
  "text-cyan-800",
  "text-sky-800",
  "text-blue-800",
  "text-indigo-800",
  "text-emerald-800",
  "text-lime-800",
  "text-amber-900",
  "text-orange-800",
  "text-rose-800",
  "text-fuchsia-800",
];

function buildInitial(answers: Props["initialAnswers"], snapshot: Snapshot | null): Record<string, AnswerState> {
  const map: Record<string, AnswerState> = {};
  for (const item of CS_CHECKLIST_ITEMS) {
    const existing = answers.find((a) => a.itemKey === item.key);
    let value = existing?.value || "";
    let yesNo: "" | "yes" | "no" = "";
    if (item.type === "yes_no_extra") {
      if (value === "no" || existing?.value === "no") yesNo = "no";
      else if (value === "yes" || existing?.note) yesNo = "yes";
    }
    if (!value) {
      if (item.key === "customer_name") value = snapshot?.customerName || "";
      if (item.key === "address_complete") {
        value = [snapshot?.address, snapshot?.area, snapshot?.governorate].filter(Boolean).join(" — ");
      }
      if (item.key === "primary_phone") value = snapshot?.phone || "";
      if (item.key === "invoice_total") value = `${snapshot?.total || ""} ${snapshot?.currency || "EGP"}`.trim();
    }
    map[item.key] = {
      confirmed: Boolean(existing?.confirmed),
      value,
      note: existing?.note || "",
      yesNo,
    };
  }
  return map;
}

export function CsCallSheet({ confirmationId, status, snapshot, initialAnswers, readOnly }: Props) {
  const [answers, setAnswers] = useState(() => buildInitial(initialAnswers, snapshot));
  const [missing, setMissing] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const payloadAnswers: CsChecklistAnswerInput[] = useMemo(
    () =>
      CS_CHECKLIST_ITEMS.map((item) => {
        const state = answers[item.key];
        return {
          itemKey: item.key,
          confirmed: state.confirmed,
          value: item.type === "yes_no_extra" ? state.yesNo || null : state.value || null,
          note: item.type === "yes_no_extra" ? state.note || null : state.note || null,
          yesNo: item.type === "yes_no_extra" ? state.yesNo || null : null,
        };
      }),
    [answers],
  );

  const doneCount = useMemo(() => {
    const result = validateChecklistAnswers(payloadAnswers);
    return CS_CHECKLIST_ITEMS.length - result.missing.length;
  }, [payloadAnswers]);

  function update(key: string, patch: Partial<AnswerState>) {
    setAnswers((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function save(finalize: boolean, failContact = false) {
    setSaving(true);
    setMessage("");
    if (finalize && !failContact) {
      const validation = validateChecklistAnswers(payloadAnswers);
      setMissing(validation.missing);
      if (!validation.ok) {
        setSaving(false);
        setMessage("استكمل البنود الناقصة المظللة بالأحمر قبل الحفظ النهائي.");
        return;
      }
    }

    const res = await fetch(`/api/cs/confirmations/${confirmationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: payloadAnswers,
        finalize,
        failContact,
        failReason: failContact ? "تعذر التواصل مع العميل" : undefined,
      }),
    });
    const data = (await res.json()) as { message?: string; missing?: string[] };
    setSaving(false);

    if (!res.ok) {
      setMissing(data.missing || []);
      setMessage(data.message || "تعذر الحفظ.");
      return;
    }

    setMessage(finalize ? (failContact ? "تم تسجيل تعذر التواصل." : "تم تأكيد الطلب بالكامل.") : "تم حفظ المسودة.");
    if (finalize) {
      window.location.href = "/cs";
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/cs" className="text-sm font-bold text-teal-700 underline">
            رجوع للقائمة
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-900">
            تأكيد طلب #{snapshot?.number || confirmationId}
          </h1>
          <p className="text-sm text-slate-600">الحالة: {status}</p>
        </div>
        <div className="rounded-2xl bg-white/90 px-4 py-3 text-sm font-bold shadow ring-1 ring-teal-200">
          مكتمل: <span className="text-teal-700">{doneCount}</span> / {CS_CHECKLIST_ITEMS.length}
        </div>
      </div>

      {/* Order + invoice summary */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-l from-teal-700 via-cyan-700 to-blue-700 p-1 shadow-xl">
        <div className="rounded-[1.35rem] bg-white/95 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-teal-700">بيانات الأوردر والفاتورة</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{snapshot?.customerName}</p>
              <p className="mt-1 text-sm text-slate-600" dir="ltr">
                {snapshot?.phone}
              </p>
            </div>
            <div className="rounded-2xl bg-brand-gold px-4 py-3 text-center shadow">
              <p className="text-xs font-bold text-black/70">إجمالي الفاتورة</p>
              <p className="text-2xl font-extrabold text-black">
                {snapshot?.total} {snapshot?.currency || "EGP"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-teal-50 px-3 py-3 ring-1 ring-teal-100">
              <p className="text-xs font-bold text-teal-700">العنوان</p>
              <p className="mt-1 font-bold text-slate-800">
                {snapshot?.address} — {snapshot?.area} — {snapshot?.governorate}
              </p>
            </div>
            <div className="rounded-2xl bg-cyan-50 px-3 py-3 ring-1 ring-cyan-100">
              <p className="text-xs font-bold text-cyan-700">الدفع على Woo</p>
              <p className="mt-1 font-bold text-slate-800">{snapshot?.paymentMethod || "—"}</p>
            </div>
            <div className="rounded-2xl bg-blue-50 px-3 py-3 ring-1 ring-blue-100">
              <p className="text-xs font-bold text-blue-700">حالة الطلب</p>
              <p className="mt-1 font-bold text-slate-800">{snapshot?.status || "—"}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-3 py-3 ring-1 ring-amber-100">
              <p className="text-xs font-bold text-amber-800">الشحن</p>
              <p className="mt-1 font-bold text-slate-800">{snapshot?.freeShippingHint || "راجع مع العميل"}</p>
            </div>
          </div>

          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(snapshot?.items || []).map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 ring-1 ring-slate-100"
              >
                {item.quantity}× {item.name} {item.sku ? `(${item.sku})` : ""} — {item.total} ج.م
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4 x 3 checklist grid */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold text-slate-900">سكربت المكالمة — مربعات التأكيد</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CS_CHECKLIST_ITEMS.map((item, index) => {
            const state = answers[item.key];
            const isMissing = missing.includes(item.key);
            const tone = CARD_TONES[index % CARD_TONES.length];
            const titleTone = TITLE_TONES[index % TITLE_TONES.length];

            return (
              <div
                key={item.key}
                className={`flex min-h-[210px] flex-col rounded-3xl bg-gradient-to-b p-4 shadow-md ring-1 ${tone} ${
                  isMissing ? "!ring-2 !ring-red-500" : ""
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-base font-extrabold ${titleTone}`}>{item.label}</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">{item.help}</p>
                  </div>
                  {isMissing ? <span className="shrink-0 text-[10px] font-extrabold text-red-600">مطلوب</span> : null}
                </div>

                <div className="mt-auto space-y-2">
                  {item.type === "confirm_text" ? (
                    <>
                      <input
                        disabled={readOnly}
                        value={state.value}
                        onChange={(e) => update(item.key, { value: e.target.value })}
                        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-400"
                      />
                      <label className="flex items-center gap-2 rounded-xl bg-white/80 px-2 py-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={state.confirmed}
                          onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                          className="size-4 accent-teal-600"
                        />
                        تم التأكيد
                      </label>
                    </>
                  ) : null}

                  {item.type === "confirm_only" ? (
                    <>
                      {item.key === "invoice_total" || item.key === "order_items" ? (
                        <div className="rounded-xl bg-white/90 px-3 py-2 text-xs font-bold text-slate-700">
                          {item.key === "invoice_total"
                            ? `${snapshot?.total || "—"} ${snapshot?.currency || "EGP"}`
                            : `${snapshot?.items?.length || 0} صنف — راجع القائمة أعلاه`}
                        </div>
                      ) : (
                        <div className="rounded-xl bg-white/90 px-3 py-2 text-xs font-bold text-slate-600">
                          أكّد مع العميل أثناء المكالمة
                        </div>
                      )}
                      <label className="flex items-center gap-2 rounded-xl bg-white/80 px-2 py-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={state.confirmed}
                          onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                          className="size-4 accent-teal-600"
                        />
                        نعم / تم
                      </label>
                    </>
                  ) : null}

                  {item.type === "choice" ? (
                    <>
                      <select
                        disabled={readOnly}
                        value={state.value}
                        onChange={(e) => update(item.key, { value: e.target.value })}
                        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-bold"
                      >
                        <option value="">اختر...</option>
                        {(item.choices || []).map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 rounded-xl bg-white/80 px-2 py-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={state.confirmed}
                          onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                          className="size-4 accent-teal-600"
                        />
                        تم التأكيد
                      </label>
                    </>
                  ) : null}

                  {item.type === "yes_no_extra" ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => update(item.key, { yesNo: "yes", confirmed: false })}
                          className={`rounded-xl px-2 py-2 text-sm font-extrabold ${
                            state.yesNo === "yes" ? "bg-teal-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
                          }`}
                        >
                          نعم
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => update(item.key, { yesNo: "no", confirmed: true, note: "" })}
                          className={`rounded-xl px-2 py-2 text-sm font-extrabold ${
                            state.yesNo === "no" ? "bg-slate-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
                          }`}
                        >
                          لا
                        </button>
                      </div>
                      {state.yesNo === "yes" ? (
                        <>
                          <input
                            disabled={readOnly}
                            value={state.note}
                            onChange={(e) => update(item.key, { note: e.target.value })}
                            placeholder="اسم ورقم البديل"
                            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-bold"
                          />
                          <label className="flex items-center gap-2 rounded-xl bg-white/80 px-2 py-2 text-sm font-bold">
                            <input
                              type="checkbox"
                              disabled={readOnly}
                              checked={state.confirmed}
                              onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                              className="size-4 accent-teal-600"
                            />
                            تم التأكيد
                          </label>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* 12th cell — progress / tip to fill 4x3 */}
          <div className="flex min-h-[210px] flex-col justify-between rounded-3xl bg-gradient-to-b from-brand-gold/40 to-white p-4 shadow-md ring-1 ring-yellow-300">
            <div>
              <p className="text-base font-extrabold text-slate-900">جاهزية الحفظ</p>
              <p className="mt-1 text-[11px] text-slate-600">
                أكمل كل المربعات ثم اضغط الحفظ النهائي. الناقص يظهر بإطار أحمر.
              </p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-4 text-center shadow-sm">
              <p className="text-3xl font-extrabold text-teal-700">
                {doneCount}/{CS_CHECKLIST_ITEMS.length}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">بنود مكتملة</p>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm font-bold ${
            missing.length ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          }`}
        >
          {message}
        </p>
      ) : null}

      {!readOnly && status !== "CONFIRMED" ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-3xl bg-white/95 p-3 shadow-xl ring-1 ring-teal-100 backdrop-blur">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(false)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold disabled:opacity-60"
          >
            حفظ مسودة
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(true)}
            className="rounded-2xl bg-brand-gold px-4 py-3 text-sm font-extrabold text-black disabled:opacity-60"
          >
            حفظ نهائي بعد اكتمال كل البنود
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(true, true)}
            className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
          >
            تعذر التواصل
          </button>
        </div>
      ) : null}
    </div>
  );
}
