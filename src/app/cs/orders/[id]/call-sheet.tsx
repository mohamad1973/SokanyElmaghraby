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
          value:
            item.type === "yes_no_extra"
              ? state.yesNo || null
              : state.value || null,
          note: item.type === "yes_no_extra" ? state.note || null : state.note || null,
          yesNo: item.type === "yes_no_extra" ? state.yesNo || null : null,
        };
      }),
    [answers],
  );

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
          <Link href="/cs" className="text-sm font-bold text-slate-600 underline">
            رجوع للقائمة
          </Link>
          <h1 className="mt-2 text-2xl font-bold">تأكيد طلب #{snapshot?.number || confirmationId}</h1>
          <p className="text-sm text-slate-600">الحالة: {status}</p>
        </div>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="font-bold">بيانات الطلب من ووكومرس</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-slate-500">العميل:</span> {snapshot?.customerName}
          </p>
          <p dir="ltr">
            <span className="text-slate-500">تليفون:</span> {snapshot?.phone}
          </p>
          <p className="sm:col-span-2">
            <span className="text-slate-500">العنوان:</span> {snapshot?.address} — {snapshot?.area} —{" "}
            {snapshot?.governorate}
          </p>
          <p>
            <span className="text-slate-500">الإجمالي:</span> {snapshot?.total} {snapshot?.currency || "EGP"}
          </p>
          <p>
            <span className="text-slate-500">الدفع:</span> {snapshot?.paymentMethod}
          </p>
        </div>
        <ul className="mt-4 space-y-1 text-sm">
          {(snapshot?.items || []).map((item, index) => (
            <li key={`${item.name}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
              {item.quantity}× {item.name} {item.sku ? `(${item.sku})` : ""} — {item.total} ج.م
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">{snapshot?.freeShippingHint}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">سكربت المكالمة</h2>
        {CS_CHECKLIST_ITEMS.map((item) => {
          const state = answers[item.key];
          const isMissing = missing.includes(item.key);
          return (
            <div
              key={item.key}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${
                isMissing ? "border-red-500 ring-2 ring-red-200" : "border-black/10"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.help}</p>
                </div>
                {isMissing ? <span className="text-xs font-bold text-red-600">مطلوب</span> : null}
              </div>

              {item.type === "confirm_text" ? (
                <div className="mt-3 space-y-2">
                  <input
                    disabled={readOnly}
                    value={state.value}
                    onChange={(e) => update(item.key, { value: e.target.value })}
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={state.confirmed}
                      onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                    />
                    تم التأكيد مع العميل
                  </label>
                </div>
              ) : null}

              {item.type === "confirm_only" ? (
                <label className="mt-3 flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={state.confirmed}
                    onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                  />
                  تم التأكيد / الإعلام
                </label>
              ) : null}

              {item.type === "choice" ? (
                <div className="mt-3 space-y-2">
                  <select
                    disabled={readOnly}
                    value={state.value}
                    onChange={(e) => update(item.key, { value: e.target.value })}
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                  >
                    <option value="">اختر...</option>
                    {(item.choices || []).map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={state.confirmed}
                      onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                    />
                    تم التأكيد
                  </label>
                </div>
              ) : null}

              {item.type === "yes_no_extra" ? (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-4 text-sm font-bold">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        disabled={readOnly}
                        checked={state.yesNo === "yes"}
                        onChange={() => update(item.key, { yesNo: "yes", confirmed: false })}
                      />
                      نعم
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        disabled={readOnly}
                        checked={state.yesNo === "no"}
                        onChange={() => update(item.key, { yesNo: "no", confirmed: true, note: "" })}
                      />
                      لا يوجد
                    </label>
                  </div>
                  {state.yesNo === "yes" ? (
                    <input
                      disabled={readOnly}
                      value={state.note}
                      onChange={(e) => update(item.key, { note: e.target.value })}
                      placeholder="اسم ورقم الشخص البديل"
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                    />
                  ) : null}
                  {state.yesNo === "yes" ? (
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={state.confirmed}
                        onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                      />
                      تم تسجيل البديل والتأكيد
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      {message ? (
        <p className={`rounded-xl px-4 py-3 text-sm font-bold ${missing.length ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {message}
        </p>
      ) : null}

      {!readOnly && status !== "CONFIRMED" ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(false)}
            className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-bold disabled:opacity-60"
          >
            حفظ مسودة
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(true)}
            className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-black disabled:opacity-60"
          >
            حفظ نهائي بعد اكتمال كل البنود
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(true, true)}
            className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            تعذر التواصل
          </button>
        </div>
      ) : null}
    </div>
  );
}
