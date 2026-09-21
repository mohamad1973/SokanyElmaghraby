"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  CS_CHECKLIST_ITEMS,
  CS_FOLLOWUP_ITEMS,
  type CsChecklistAnswerInput,
  validateChecklistAnswers,
} from "@/lib/cs/checklist";
import { formatCairoOrderDateTime } from "@/lib/cs/order-window";

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
  wooStatus?: string;
  trackingNumber?: string | null;
  freeShippingHint?: string;
  dateCreated?: string;
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
  followUp?: {
    handedToCarrier: boolean;
    deliveredToCustomer: boolean;
    customerFollowUp: boolean;
  };
  shippingCompany?: string | null;
};

function buildInitial(answers: Props["initialAnswers"], snapshot: Snapshot | null): Record<string, AnswerState> {
  const map: Record<string, AnswerState> = {};
  for (const item of [...CS_CHECKLIST_ITEMS, ...CS_FOLLOWUP_ITEMS]) {
    const existing = answers.find((a) => a.itemKey === item.key);
    let value = existing?.value || "";
    let yesNo: "" | "yes" | "no" = "";
    if (item.type === "yes_no_extra") {
      if (value === "no") yesNo = "no";
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

export function CsCallSheet({
  confirmationId,
  status,
  snapshot,
  initialAnswers,
  followUp,
  shippingCompany,
}: Props) {
  const confirmed = status === "CONFIRMED";
  const [answers, setAnswers] = useState(() => {
    const base = buildInitial(initialAnswers, snapshot);
    if (shippingCompany && !base.shipping_company.value) {
      base.shipping_company.value = shippingCompany;
      base.shipping_company.confirmed = true;
    }
    return base;
  });
  const [fu, setFu] = useState({
    handedToCarrier: Boolean(followUp?.handedToCarrier),
    deliveredToCustomer: Boolean(followUp?.deliveredToCustomer),
    customerFollowUp: Boolean(followUp?.customerFollowUp),
  });
  const [missing, setMissing] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const when = formatCairoOrderDateTime(snapshot?.dateCreated);

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

  function update(key: string, patch: Partial<AnswerState>) {
    setAnswers((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function save(finalize: boolean, failContact = false) {
    setSaving(true);
    setMessage("");
    if (finalize && !failContact && !confirmed) {
      const validation = validateChecklistAnswers(payloadAnswers);
      setMissing(validation.missing);
      if (!validation.ok) {
        setSaving(false);
        setMessage("استكمل البنود الناقصة قبل الحفظ النهائي.");
        return;
      }
    }

    const res = await fetch(`/api/cs/confirmations/${confirmationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: payloadAnswers,
        finalize: confirmed ? false : finalize,
        failContact,
        failReason: failContact ? "تعذر التواصل مع العميل" : undefined,
        followUp: confirmed ? fu : undefined,
      }),
    });
    const data = (await res.json()) as { message?: string; missing?: string[] };
    setSaving(false);

    if (!res.ok) {
      setMissing(data.missing || []);
      setMessage(data.message || "تعذر الحفظ.");
      return;
    }

    if (confirmed) {
      setMessage("تم حفظ المتابعة.");
      return;
    }

    setMessage(finalize ? (failContact ? "تم تسجيل تعذر التواصل." : "تم تأكيد الطلب.") : "تم حفظ المسودة.");
    if (finalize) window.location.href = "/cs";
  }

  const inputCls =
    "w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm font-bold text-[#14213D]";

  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] flex-col gap-3 overflow-auto p-2" dir="rtl">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link href="/cs" className="text-sm font-bold text-[#14213D] underline">
            رجوع
          </Link>
          <h1 className="truncate text-xl font-extrabold text-[#14213D]">طلب #{snapshot?.number || confirmationId}</h1>
          <p className="text-xs font-bold text-[#14213D]/60">
            {when.absolute} · {when.relative}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!confirmed ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(false)}
                className="rounded-xl bg-white px-3 py-2 text-sm font-extrabold text-[#14213D] ring-1 ring-[#E5E5E5] disabled:opacity-60"
              >
                مسودة
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                className="rounded-xl bg-[#FCA311] px-3 py-2 text-sm font-extrabold text-black disabled:opacity-60"
              >
                حفظ نهائي
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true, true)}
                className="rounded-xl bg-black px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60"
              >
                تعذر
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(false)}
              className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60"
            >
              حفظ المتابعة
            </button>
          )}
        </div>
      </div>

      <section className="shrink-0 rounded-2xl bg-[#14213D] px-4 py-3 text-sm text-white">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span className="font-extrabold">{snapshot?.customerName}</span>
          <span dir="ltr">{snapshot?.phone}</span>
          <span className="rounded bg-[#FCA311] px-2 py-0.5 font-extrabold text-black">
            {snapshot?.total} {snapshot?.currency || "EGP"}
          </span>
          <span>{snapshot?.paymentMethod}</span>
          {snapshot?.trackingNumber ? (
            <span dir="ltr">تتبع: {snapshot.trackingNumber}</span>
          ) : null}
          <span className="min-w-0 flex-1">
            {snapshot?.address} — {snapshot?.area} — {snapshot?.governorate}
          </span>
        </div>
        <div className="mt-2 text-white/80">
          {(snapshot?.items || []).map((i) => `${i.quantity}×${i.name}`).join(" · ")}
        </div>
      </section>

      {message ? (
        <p
          className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold ${
            missing.length ? "bg-red-50 text-red-700" : "bg-[#FCA311]/30 text-[#14213D]"
          }`}
        >
          {message}
        </p>
      ) : null}

      {!confirmed ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {CS_CHECKLIST_ITEMS.map((item) => {
            const state = answers[item.key];
            const isMissing = missing.includes(item.key);
            return (
              <div
                key={item.key}
                className={`flex min-h-[9rem] flex-col rounded-2xl bg-white p-3 shadow-sm ring-2 ${
                  isMissing ? "ring-red-500" : "ring-[#E5E5E5]"
                }`}
              >
                <p className="text-sm font-extrabold text-[#14213D]">{item.label}</p>
                <p className="mt-1 text-[11px] text-[#14213D]/60">{item.help}</p>
                <div className="mt-2 flex-1 space-y-2">
                  {item.type === "confirm_text" ? (
                    <>
                      <input
                        disabled={confirmed}
                        value={state.value}
                        onChange={(e) => update(item.key, { value: e.target.value })}
                        className={inputCls}
                      />
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={state.confirmed}
                          onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                        />
                        تم
                      </label>
                    </>
                  ) : null}
                  {item.type === "confirm_only" ? (
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={state.confirmed}
                        onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                      />
                      نعم / تم
                    </label>
                  ) : null}
                  {item.type === "choice" ? (
                    <>
                      <select
                        value={state.value}
                        onChange={(e) =>
                          update(item.key, { value: e.target.value, confirmed: Boolean(e.target.value) })
                        }
                        className={inputCls}
                      >
                        <option value="">اختر...</option>
                        {(item.choices || []).map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={state.confirmed}
                          onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                        />
                        تم
                      </label>
                    </>
                  ) : null}
                  {item.type === "yes_no_extra" ? (
                    <>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => update(item.key, { yesNo: "yes", confirmed: false })}
                          className={`flex-1 rounded-xl py-2 text-sm font-extrabold ${
                            state.yesNo === "yes" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
                          }`}
                        >
                          نعم
                        </button>
                        <button
                          type="button"
                          onClick={() => update(item.key, { yesNo: "no", confirmed: true, note: "" })}
                          className={`flex-1 rounded-xl py-2 text-sm font-extrabold ${
                            state.yesNo === "no" ? "bg-black text-white" : "bg-[#E5E5E5] text-[#14213D]"
                          }`}
                        >
                          لا
                        </button>
                      </div>
                      {state.yesNo === "yes" ? (
                        <>
                          <input
                            value={state.note}
                            onChange={(e) => update(item.key, { note: e.target.value })}
                            placeholder="بديل"
                            className={inputCls}
                          />
                          <label className="flex items-center gap-2 text-sm font-bold">
                            <input
                              type="checkbox"
                              checked={state.confirmed}
                              onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                            />
                            تم
                          </label>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex min-h-[10rem] cursor-pointer flex-col justify-between rounded-2xl bg-white p-5 shadow ring-2 ring-[#E5E5E5]">
            <span className="text-lg font-extrabold text-[#14213D]">تم التسليم لشركة الشحن</span>
            <input
              type="checkbox"
              className="mt-4 size-6 accent-[#FCA311]"
              checked={fu.handedToCarrier}
              onChange={(e) => setFu((p) => ({ ...p, handedToCarrier: e.target.checked }))}
            />
          </label>
          <label className="flex min-h-[10rem] cursor-pointer flex-col justify-between rounded-2xl bg-white p-5 shadow ring-2 ring-[#E5E5E5]">
            <span className="text-lg font-extrabold text-[#14213D]">تم التسليم للعميل</span>
            <p className="mt-1 text-sm text-[#14213D]/60">من التتبع أو تأكيد الاستلام</p>
            <input
              type="checkbox"
              className="mt-4 size-6 accent-[#FCA311]"
              checked={fu.deliveredToCustomer}
              onChange={(e) => setFu((p) => ({ ...p, deliveredToCustomer: e.target.checked }))}
            />
          </label>
          <label className="flex min-h-[10rem] cursor-pointer flex-col justify-between rounded-2xl bg-white p-5 shadow ring-2 ring-[#E5E5E5]">
            <span className="text-lg font-extrabold text-[#14213D]">متابعة العميل</span>
            <input
              type="checkbox"
              className="mt-4 size-6 accent-[#FCA311]"
              checked={fu.customerFollowUp}
              onChange={(e) => setFu((p) => ({ ...p, customerFollowUp: e.target.checked }))}
            />
          </label>
        </div>
      )}
    </div>
  );
}
