"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  CS_CHECKLIST_ITEMS,
  CS_FOLLOWUP_ITEMS,
  SHIPPING_COMPANY_LABEL,
  type CsChecklistAnswerInput,
  validateChecklistAnswers,
} from "@/lib/cs/checklist";
import { formatCairoOrderDateTime, resolvePaymentState } from "@/lib/cs/order-window";
import { getBostaStatusLabelAr } from "@/lib/shipping/bosta-zones";

/** Order total at/above this (EGP) shows the optional deposit card. */
const CS_DEPOSIT_THRESHOLD = 5000;

const DEPOSIT_TO_OPTIONS = [
  { phone: "01000260262", method: "wallet" as const, label: "01000260262 — محفظة" },
  { phone: "01000260262", method: "instapay" as const, label: "01000260262 — انستا" },
  { phone: "01037333490", method: "wallet" as const, label: "01037333490 — محفظة" },
  { phone: "01037333490", method: "instapay" as const, label: "01037333490 — انستا" },
];

type DepositMethod = "wallet" | "instapay" | "";

type Snapshot = {
  customerName?: string;
  phone?: string;
  address?: string;
  governorate?: string;
  area?: string;
  paymentMethod?: string;
  paymentMethodId?: string | null;
  paymentState?: "awaiting_payment" | "paid" | "cod";
  datePaid?: string | null;
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
  trackingNumber?: string | null;
  bostaStatus?: string | null;
  bostaShippingFee?: number | null;
  bostaSyncedAt?: string | null;
  bostaSyncError?: string | null;
  waybillPrinted?: boolean;
  depositAmount?: number | null;
  depositPaid?: boolean;
  depositPayMethod?: string | null;
  depositFromNumber?: string | null;
  depositInstapayName?: string | null;
  depositToPhone?: string | null;
  depositToMethod?: string | null;
  depositPaidAt?: string | null;
  depositProofUrl?: string | null;
  depositApprovalStatus?: string | null;
  postCancel?: {
    invoice: "before" | "after" | "";
    systemNo: string | null;
    refundPaid: boolean;
    at: string | null;
  };
  confirmedAt?: string | null;
  confirmationEditedAt?: string | null;
  orderTotalDelta?: number | null;
};

function makeDepositToKey(phone: string, method: string) {
  return `${phone}:${method}`;
}

function parseDepositToKey(key: string): { phone: string; method: DepositMethod } {
  const [phone = "", method = ""] = key.split(":");
  if (method === "wallet" || method === "instapay") return { phone, method };
  return { phone: "", method: "" };
}

function splitOrderTotalDelta(value: number | null | undefined): {
  sign: "plus" | "minus";
  amount: string;
} {
  if (value == null || !Number.isFinite(value) || value === 0) return { sign: "plus", amount: "" };
  return { sign: value < 0 ? "minus" : "plus", amount: String(Math.abs(value)) };
}

function parseDepositPaidParts(iso: string | null | undefined): {
  day: string;
  hour: string;
  minute: string;
  period: "morning" | "evening" | "";
} {
  if (!iso) return { day: "", hour: "", minute: "", period: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: "", hour: "", minute: "", period: "" };
  const hour24 = d.getHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    day: String(d.getDate()),
    hour: String(hour12),
    minute: pad(d.getMinutes()),
    period: hour24 < 12 ? "morning" : "evening",
  };
}

/** Build ISO from day-of-month + 12-hour clock (صباحاً / مساءً) using the current year and month. */
function buildPaidAtIsoFromDayTime(
  dayStr: string,
  hourStr: string,
  minuteStr: string,
  period: "morning" | "evening" | "",
): { ok: true; iso: string } | { ok: false; message: string } {
  const day = Number(dayStr);
  const hour12 = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { ok: false, message: "أدخل يوم الدفع (1–31)." };
  }
  if (!String(hourStr || "").trim() || !String(minuteStr || "").trim()) {
    return { ok: false, message: "أدخل ساعة ودقيقة الدفع." };
  }
  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { ok: false, message: "وقت الدفع غير صالح." };
  }
  if (period !== "morning" && period !== "evening") {
    return { ok: false, message: "اختَر صباحاً أو مساءً." };
  }
  const hour24 = period === "morning" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const candidate = new Date(year, month, day, hour24, minute, 0, 0);
  if (candidate.getMonth() !== month || candidate.getDate() !== day) {
    return { ok: false, message: "اليوم غير موجود في الشهر الحالي." };
  }
  return { ok: true, iso: candidate.toISOString() };
}

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
      if (item.key === "address_complete") value = snapshot?.address || "";
      if (item.key === "governorate_confirm") value = snapshot?.governorate || "";
      if (item.key === "area_confirm") value = snapshot?.area || "";
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
  snapshot: initialSnapshot,
  initialAnswers,
  followUp,
  shippingCompany,
  trackingNumber: initialTracking,
  bostaStatus: initialBostaStatus,
  bostaShippingFee: initialBostaFee,
  bostaSyncedAt: initialBostaSyncedAt,
  bostaSyncError: initialBostaError,
  waybillPrinted: initialWaybillPrinted,
  depositAmount: initialDepositAmount,
  depositPaid: initialDepositPaid,
  depositPayMethod: initialDepositPayMethod,
  depositFromNumber: initialDepositFromNumber,
  depositInstapayName: initialDepositInstapayName,
  depositToPhone: initialDepositToPhone,
  depositToMethod: initialDepositToMethod,
  depositPaidAt: initialDepositPaidAt,
  depositApprovalStatus: initialDepositApprovalStatus,
  postCancel,
  confirmedAt,
  confirmationEditedAt,
  orderTotalDelta: initialOrderTotalDelta,
}: Props) {
  const confirmed = status === "CONFIRMED";
  const showFollowUp = confirmed || Boolean(postCancel?.at);
  const lockedShipping =
    shippingCompany === "bosta" || shippingCompany === "sayed_temima" ? shippingCompany : null;

  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [answers, setAnswers] = useState(() => {
    const base = buildInitial(initialAnswers, initialSnapshot);
    if (lockedShipping) {
      base.shipping_company.value = lockedShipping;
      base.shipping_company.confirmed = true;
    }
    return base;
  });
  const [fu, setFu] = useState({
    handedToCarrier: Boolean(followUp?.handedToCarrier),
    deliveredToCustomer: Boolean(followUp?.deliveredToCustomer),
    customerFollowUp: Boolean(followUp?.customerFollowUp),
  });
  const [trackingNumber, setTrackingNumber] = useState(
    () => String(initialTracking || initialSnapshot?.trackingNumber || "").trim(),
  );
  const [bostaStatus, setBostaStatus] = useState(initialBostaStatus || "");
  const [bostaFee, setBostaFee] = useState<number | null>(initialBostaFee ?? null);
  const [bostaSyncedAt, setBostaSyncedAt] = useState(initialBostaSyncedAt || "");
  const [bostaError, setBostaError] = useState(initialBostaError || "");
  const [bostaCod, setBostaCod] = useState<number | null>(null);
  const [bostaLastEvent, setBostaLastEvent] = useState("");

  useEffect(() => {
    if (lockedShipping !== "bosta") return;
    const ac = new AbortController();
    void fetch(`/api/cs/confirmations/${confirmationId}/bosta`, { method: "POST", signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          trackingNumber?: string | null;
          bostaStatus?: string | null;
          bostaShippingFee?: number | null;
          bostaSyncedAt?: string | null;
          bostaSyncError?: string | null;
          cod?: number | null;
          lastEvent?: string | null;
        };
        if (!res.ok) {
          setBostaError(data.message || data.bostaSyncError || "تعذر جلب بوليصة بوسطة.");
          return;
        }
        if (data.trackingNumber) setTrackingNumber(data.trackingNumber);
        if (data.bostaStatus) setBostaStatus(data.bostaStatus);
        if (data.bostaShippingFee !== undefined && data.bostaShippingFee !== null) setBostaFee(data.bostaShippingFee);
        if (data.bostaSyncedAt) setBostaSyncedAt(data.bostaSyncedAt);
        if (data.cod !== undefined && data.cod !== null) setBostaCod(data.cod);
        if (data.lastEvent) setBostaLastEvent(data.lastEvent);
        setBostaError(data.bostaSyncError || "");
      })
      .catch((error: unknown) => {
        if (ac.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setBostaError("تعذر الاتصال لجلب بوليصة بوسطة.");
      });
    return () => ac.abort();
  }, [confirmationId, initialTracking, lockedShipping]);

  useEffect(() => {
    if (status === "CONFIRMED" || status === "FAILED_CONTACT" || status === "CANCELLED") return;
    const ac = new AbortController();
    void fetch(`/api/cs/confirmations/${confirmationId}/start`, { method: "POST", signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { confirmation?: { customerSnapshot?: Snapshot | null } };
        if (data.confirmation?.customerSnapshot) setSnapshot(data.confirmation.customerSnapshot);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [confirmationId, status]);
  const [waybillPrinted, setWaybillPrinted] = useState(Boolean(initialWaybillPrinted));
  const [depositAmount, setDepositAmount] = useState(() => {
    if (initialDepositAmount === null || initialDepositAmount === undefined) return "";
    return String(initialDepositAmount);
  });
  const [depositApprovalStatus, setDepositApprovalStatus] = useState(() => {
    const s = String(initialDepositApprovalStatus || "").trim().toLowerCase();
    if (s === "pending" || s === "approved" || s === "rejected") return s;
    return initialDepositPaid ? "approved" : "none";
  });
  const [depositPayMethod, setDepositPayMethod] = useState<DepositMethod>(() => {
    const m = String(initialDepositPayMethod || "").trim();
    return m === "wallet" || m === "instapay" ? m : "";
  });
  const [depositFromNumber, setDepositFromNumber] = useState(
    () => String(initialDepositFromNumber || "").trim(),
  );
  const [depositInstapayName, setDepositInstapayName] = useState(
    () => String(initialDepositInstapayName || "").trim(),
  );
  const [depositToKey, setDepositToKey] = useState(() => {
    const phone = String(initialDepositToPhone || "").trim();
    const method = String(initialDepositToMethod || "").trim();
    if (phone && (method === "wallet" || method === "instapay")) return makeDepositToKey(phone, method);
    return "";
  });
  const paidParts = parseDepositPaidParts(initialDepositPaidAt);
  const [depositPaidDay, setDepositPaidDay] = useState(() => paidParts.day);
  const [depositPaidHour, setDepositPaidHour] = useState(() => paidParts.hour);
  const [depositPaidMinute, setDepositPaidMinute] = useState(() => paidParts.minute);
  const [depositPaidPeriod, setDepositPaidPeriod] = useState<"morning" | "evening" | "">(() => paidParts.period);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [postInvoice, setPostInvoice] = useState<"before" | "after" | "">(
    () => postCancel?.invoice || "",
  );
  const [postSystemNo, setPostSystemNo] = useState(() => String(postCancel?.systemNo || "").trim());
  const [postRefundPaid, setPostRefundPaid] = useState(Boolean(postCancel?.refundPaid));
  const initialDelta = splitOrderTotalDelta(initialOrderTotalDelta);
  const [totalSign, setTotalSign] = useState<"plus" | "minus">(initialDelta.sign);
  const [totalAdjustAmount, setTotalAdjustAmount] = useState(initialDelta.amount);
  const [missing, setMissing] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const when = formatCairoOrderDateTime(snapshot?.dateCreated);
  const savedWhen = confirmedAt ? formatCairoOrderDateTime(confirmedAt) : null;
  const editedWhen = confirmationEditedAt ? formatCairoOrderDateTime(confirmationEditedAt) : null;
  const wooTotal = Number(String(snapshot?.total || "").replace(/,/g, ""));
  const adjustAbs = Number(String(totalAdjustAmount).replace(/,/g, "").trim());
  const signedDelta =
    !String(totalAdjustAmount).trim() || !Number.isFinite(adjustAbs) || adjustAbs <= 0
      ? 0
      : totalSign === "minus"
        ? -adjustAbs
        : adjustAbs;
  const adjustedTotal = Math.max(0, (Number.isFinite(wooTotal) ? wooTotal : 0) + signedDelta);
  const showDepositCard = adjustedTotal >= CS_DEPOSIT_THRESHOLD;
  const paymentState =
    snapshot?.paymentState ||
    resolvePaymentState({
      paymentMethod: snapshot?.paymentMethod,
      paymentMethodId: snapshot?.paymentMethodId,
      wooStatus: snapshot?.wooStatus,
      datePaid: snapshot?.datePaid,
    });
  const fawryPaid =
    paymentState === "paid" && /fawry|فورى|فوري/i.test(`${snapshot?.paymentMethod || ""} ${snapshot?.paymentMethodId || ""}`);
  const showCancelCard = showFollowUp && (!fu.handedToCarrier || postRefundPaid);

  const payloadAnswers: CsChecklistAnswerInput[] = useMemo(
    () =>
      CS_CHECKLIST_ITEMS.map((item) => {
        const state = answers[item.key];
        if (item.key === "shipping_company" && lockedShipping) {
          return {
            itemKey: item.key,
            confirmed: true,
            value: lockedShipping,
            note: null,
            yesNo: null,
          };
        }
        return {
          itemKey: item.key,
          confirmed: state.confirmed,
          value: item.type === "yes_no_extra" ? state.yesNo || null : state.value || null,
          note: item.type === "yes_no_extra" ? state.note || null : state.note || null,
          yesNo: item.type === "yes_no_extra" ? state.yesNo || null : null,
        };
      }),
    [answers, lockedShipping],
  );

  function update(key: string, patch: Partial<AnswerState>) {
    setAnswers((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function save(finalize: boolean, failContact = false, cancelOrder = false) {
    setSaving(true);
    setMessage("");
    if (finalize && !failContact && !cancelOrder && !confirmed) {
      if (!lockedShipping) {
        setSaving(false);
        setMessage("يجب أن تحدد المشرفة شركة الشحن أولاً من قائمة الأوردرات.");
        setMissing(["shipping_company"]);
        return;
      }
      const validation = validateChecklistAnswers(payloadAnswers);
      setMissing(validation.missing);
      if (!validation.ok) {
        setSaving(false);
        setMessage("استكمل البنود الناقصة قبل الحفظ النهائي.");
        return;
      }
    }

    const to = parseDepositToKey(depositToKey);

    if (showFollowUp && postRefundPaid) {
      if (fu.handedToCarrier) {
        setSaving(false);
        setMessage("لا يمكن الإلغاء بعد التسليم لشركة الشحن.");
        return;
      }
      if (postInvoice !== "before" && postInvoice !== "after") {
        setSaving(false);
        setMessage("حدّد الإلغاء قبل الفاتورة أو بعد الفاتورة.");
        return;
      }
      if (postInvoice === "after" && !postSystemNo.trim()) {
        setSaving(false);
        setMessage("اكتب رقم الإلغاء على السيستم.");
        return;
      }
    }

    const res = await fetch(`/api/cs/confirmations/${confirmationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: payloadAnswers,
        finalize: showFollowUp ? false : finalize,
        failContact,
        cancelOrder,
        failReason: failContact ? "لم يرد" : cancelOrder ? "لاغى" : undefined,
        trackingNumber,
        waybillPrinted,
        depositAmount: depositAmount.trim() === "" ? null : depositAmount.trim(),
        depositPayMethod: depositPayMethod || null,
        depositFromNumber: depositFromNumber.trim() || null,
        depositInstapayName: depositPayMethod === "instapay" ? depositInstapayName.trim() || null : null,
        depositToPhone: to.phone || null,
        depositToMethod: to.method || null,
        orderTotalDelta: signedDelta === 0 ? null : Math.round(signedDelta * 100) / 100,
        postCancel:
          showFollowUp && postRefundPaid
            ? { invoice: postInvoice, systemNo: postSystemNo, refundPaid: true }
            : undefined,
        followUp: showFollowUp ? fu : undefined,
      }),
    });
    const data = (await res.json()) as {
      message?: string;
      missing?: string[];
      bostaMessage?: string | null;
      trackingNumber?: string | null;
      bostaStatus?: string | null;
      bostaShippingFee?: number | null;
      bostaSyncedAt?: string | null;
      bostaSyncError?: string | null;
      cod?: number | null;
      lastEvent?: string | null;
    };
    setSaving(false);

    if (!res.ok) {
      setMissing(data.missing || []);
      setMessage(data.message || "تعذر الحفظ.");
      return;
    }

    if (data.trackingNumber) setTrackingNumber(data.trackingNumber);
    if (data.bostaStatus) setBostaStatus(data.bostaStatus);
    if (data.bostaShippingFee !== undefined && data.bostaShippingFee !== null) setBostaFee(data.bostaShippingFee);
    if (data.bostaSyncedAt) setBostaSyncedAt(data.bostaSyncedAt);
    if (data.bostaSyncError !== undefined) setBostaError(data.bostaSyncError || "");
    if (data.cod !== undefined && data.cod !== null) setBostaCod(data.cod);
    if (data.lastEvent) setBostaLastEvent(data.lastEvent);
    if (data.bostaSyncError) {
      setMessage(data.bostaMessage || data.bostaSyncError);
      return;
    }
    const bostaNote = data.bostaMessage ? ` ${data.bostaMessage}` : "";

    if (showFollowUp) {
      setMessage(postRefundPaid ? "تم تسجيل الإلغاء." : data.bostaMessage || "تم حفظ المتابعة.");
      return;
    }

    setMessage(
      (finalize
        ? failContact
          ? "تم تسجيل: لم يرد."
          : cancelOrder
            ? "تم تسجيل: لاغى."
            : "تم تأكيد الطلب."
        : "تم حفظ المسودة.") + bostaNote,
    );
    if (finalize) window.location.href = "/cs";
  }

  const inputCls =
    "w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-xs font-bold text-[#14213D]";
  const compactBtn = "rounded-lg px-2.5 py-1 text-[11px] font-extrabold";

  const checklistVisible = CS_CHECKLIST_ITEMS.filter((item) => item.key !== "shipping_company");

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
          {savedWhen ? (
            <p className="text-xs font-bold text-[#14213D]/70">حُفظ {savedWhen.absolute}</p>
          ) : null}
          {editedWhen ? (
            <p className="text-xs font-bold text-[#14213D]/70">عُدّل {editedWhen.absolute}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!showFollowUp ? (
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
                لم يرد
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true, false, true)}
                className="rounded-xl bg-red-700 px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60"
              >
                لاغى
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
          <span className="font-extrabold">{answers.customer_name?.value || snapshot?.customerName}</span>
          <span dir="ltr">{answers.primary_phone?.value || snapshot?.phone}</span>
          <span className="rounded bg-[#FCA311] px-2 py-0.5 font-extrabold text-black">
            {signedDelta === 0
              ? snapshot?.total
              : adjustedTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
            {snapshot?.currency || "EGP"}
          </span>
          <span>{snapshot?.paymentMethod}</span>
          {lockedShipping ? (
            <span className="rounded bg-white/15 px-2 py-0.5">
              شحن: {SHIPPING_COMPANY_LABEL[lockedShipping]}
            </span>
          ) : (
            <span className="rounded bg-black/40 px-2 py-0.5 text-[#FCA311]">شحن: لم تُحدد المشرفة بعد</span>
          )}
          {snapshot?.trackingNumber ? (
            <span dir="ltr">تتبع: {snapshot.trackingNumber}</span>
          ) : null}
        </div>
        <div className="mt-2 grid gap-1 text-white/90 sm:grid-cols-3">
          <span>الشارع: {answers.address_complete?.value || snapshot?.address || "—"}</span>
          <span>المحافظة: {answers.governorate_confirm?.value || snapshot?.governorate || "—"}</span>
          <span>المنطقة: {answers.area_confirm?.value || snapshot?.area || "—"}</span>
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

      {!showFollowUp ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {checklistVisible.map((item) => {
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
                  {item.key === "invoice_total" ? (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setTotalSign("plus")}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-extrabold ${
                            totalSign === "plus" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
                          }`}
                        >
                          زائد
                        </button>
                        <button
                          type="button"
                          onClick={() => setTotalSign("minus")}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-extrabold ${
                            totalSign === "minus" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
                          }`}
                        >
                          ناقص
                        </button>
                      </div>
                      <input
                        inputMode="decimal"
                        value={totalAdjustAmount}
                        onChange={(e) => setTotalAdjustAmount(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder="المبلغ المضاف أو المخصوم"
                        className={inputCls}
                      />
                      <p className="text-xs font-bold text-[#14213D]">
                        الإجمالي بعد التعديل:{" "}
                        {adjustedTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                        {snapshot?.currency || "EGP"}
                      </p>
                    </div>
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
        <div className={`grid grid-cols-1 gap-3 ${showCancelCard ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}>
          {showCancelCard ? (
            <div className="flex min-h-[10rem] flex-col justify-between rounded-2xl bg-red-50 p-5 shadow ring-2 ring-red-700">
              <div>
                <p className="text-lg font-extrabold text-red-800">إلغاء بعد التأكيد</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setPostInvoice("before")}
                    className={`rounded-lg px-2 py-1 text-xs font-extrabold ${
                      postInvoice === "before" ? "bg-red-700 text-white" : "bg-white text-[#14213D]"
                    }`}
                  >
                    قبل الفاتورة
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostInvoice("after")}
                    className={`rounded-lg px-2 py-1 text-xs font-extrabold ${
                      postInvoice === "after" ? "bg-red-700 text-white" : "bg-white text-[#14213D]"
                    }`}
                  >
                    بعد الفاتورة
                  </button>
                </div>
                {postInvoice === "after" ? (
                  <input
                    value={postSystemNo}
                    onChange={(e) => setPostSystemNo(e.target.value)}
                    placeholder="رقم الإلغاء على السيستم"
                    className="mt-2 w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-xs font-bold"
                  />
                ) : null}
                {fawryPaid ? <p className="mt-2 text-xs font-extrabold text-red-800">طلب استرداد المبلغ</p> : null}
                {depositApprovalStatus === "approved" || initialDepositPaid ? (
                  <p className="mt-1 text-xs font-extrabold text-red-800">طلب استرداد الديبوزت</p>
                ) : null}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm font-extrabold text-[#14213D]">
                <input
                  type="checkbox"
                  className="size-5 accent-red-700"
                  checked={postRefundPaid}
                  onChange={(e) => setPostRefundPaid(e.target.checked)}
                />
                تم الدفع للعميل
              </label>
            </div>
          ) : null}
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

      {showFollowUp && lockedShipping === "bosta" ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {(
            [
              ["customer_name", "الاسم"],
              ["primary_phone", "التليفون"],
              ["governorate_confirm", "المحافظة"],
              ["area_confirm", "المنطقة"],
              ["address_complete", "العنوان"],
              ["address_landmarks", "علامات مميزة"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-xs font-bold text-[#14213D]">
              {label}
              <input
                value={answers[key]?.value || ""}
                onChange={(e) => update(key, { value: e.target.value, confirmed: true })}
                className={inputCls}
              />
            </label>
          ))}
          <label className="grid gap-1 text-xs font-bold text-[#14213D]">
            تليفون إضافي
            <input
              value={answers.alt_phone?.yesNo === "no" ? "" : answers.alt_phone?.note || ""}
              onChange={(e) =>
                update("alt_phone", {
                  yesNo: e.target.value.trim() ? "yes" : "no",
                  note: e.target.value,
                  confirmed: true,
                })
              }
              className={inputCls}
            />
          </label>
        </div>
      ) : null}

      {/* Bottom row: shipping + deposit + tracking + waybill */}
      <div className="mt-auto grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div
          className={`flex min-h-[7.5rem] flex-col rounded-xl p-2.5 shadow-sm ring-2 ${
            missing.includes("shipping_company")
              ? "ring-red-500 bg-white"
              : "ring-[#FCA311] bg-[#FCA311]/20"
          }`}
        >
          <p className="text-xs font-extrabold text-[#14213D]">شركة الشحن</p>
          <p className="mt-0.5 text-[10px] text-[#14213D]/60">تحددها المشرفة من القائمة</p>
          <p className="mt-2 text-sm font-extrabold text-[#14213D]">
            {lockedShipping ? SHIPPING_COMPANY_LABEL[lockedShipping] : "لم تُحدد بعد"}
          </p>
        </div>

        {showDepositCard ? (
          <div className="flex min-h-[7.5rem] flex-col rounded-xl bg-[#0D9488]/15 p-2.5 shadow-sm ring-2 ring-[#0D9488]">
            <p className="text-xs font-extrabold text-[#14213D]">طلب ديبوزت</p>
            <p className="mt-0.5 text-[10px] text-[#14213D]/60">اختياري — ليس شرطاً للحفظ</p>
            <div className="mt-1.5 space-y-1.5">
              <div>
                <p className="text-[10px] font-bold text-[#14213D]/70">الدفع من</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setDepositPayMethod("wallet")}
                    className={`${compactBtn} ${
                      depositPayMethod === "wallet" ? "bg-[#0D9488] text-white" : "bg-white text-[#14213D]"
                    }`}
                  >
                    محفظة
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositPayMethod("instapay")}
                    className={`${compactBtn} ${
                      depositPayMethod === "instapay" ? "bg-[#0D9488] text-white" : "bg-white text-[#14213D]"
                    }`}
                  >
                    انستا
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#14213D]/70">من رقم</label>
                <input
                  dir="ltr"
                  value={depositFromNumber}
                  onChange={(e) => setDepositFromNumber(e.target.value)}
                  placeholder="رقم العميل"
                  className={inputCls}
                />
              </div>
              {depositPayMethod === "instapay" ? (
                <div>
                  <label className="text-[10px] font-bold text-[#14213D]/70">اسم حساب انستا</label>
                  <input
                    value={depositInstapayName}
                    onChange={(e) => setDepositInstapayName(e.target.value)}
                    placeholder="اختياري"
                    className={inputCls}
                  />
                </div>
              ) : null}
              <div>
                <label className="text-[10px] font-bold text-[#14213D]/70">الدفع إلى</label>
                <select
                  value={depositToKey}
                  onChange={(e) => setDepositToKey(e.target.value)}
                  className={inputCls}
                  dir="ltr"
                >
                  <option value="">اختر...</option>
                  {DEPOSIT_TO_OPTIONS.map((opt) => (
                    <option
                      key={makeDepositToKey(opt.phone, opt.method)}
                      value={makeDepositToKey(opt.phone, opt.method)}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#14213D]/70">قيمة المقدم</label>
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#14213D]/70">يوم الدفع (1–31)</label>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={depositPaidDay}
                  onChange={(e) => setDepositPaidDay(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                  placeholder="اليوم"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#14213D]/70">ساعة ودقيقة الدفع</label>
                <div className="mt-0.5 flex items-center gap-1">
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={depositPaidHour}
                    onChange={(e) => setDepositPaidHour(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                    placeholder="ساعة"
                    className={inputCls}
                  />
                  <span className="text-xs font-extrabold text-[#14213D]">:</span>
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={depositPaidMinute}
                    onChange={(e) => setDepositPaidMinute(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                    placeholder="دقيقة"
                    className={inputCls}
                  />
                </div>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDepositPaidPeriod("morning")}
                    className={`${compactBtn} flex-1 ${
                      depositPaidPeriod === "morning" ? "bg-[#0D9488] text-white" : "bg-white text-[#14213D]"
                    }`}
                  >
                    صباحاً
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositPaidPeriod("evening")}
                    className={`${compactBtn} flex-1 ${
                      depositPaidPeriod === "evening" ? "bg-[#0D9488] text-white" : "bg-white text-[#14213D]"
                    }`}
                  >
                    مساءً
                  </button>
                </div>
              </div>
              <div className="rounded-lg bg-white/70 px-2 py-1 text-[10px] font-bold text-[#14213D]">
                {depositApprovalStatus === "pending"
                  ? "بانتظار موافقة الأدمن"
                  : depositApprovalStatus === "approved"
                    ? "معتمد — العميل دفع"
                    : depositApprovalStatus === "rejected"
                      ? "مرفوض — العميل لم يدفع"
                      : "لم يُطلب موافقة بعد"}
              </div>
              <button
                type="button"
                disabled={requestingApproval || depositApprovalStatus === "pending"}
                onClick={() => {
                  void (async () => {
                    setRequestingApproval(true);
                    setMessage("");
                    const to = parseDepositToKey(depositToKey);
                    const paidAt = buildPaidAtIsoFromDayTime(
                      depositPaidDay,
                      depositPaidHour,
                      depositPaidMinute,
                      depositPaidPeriod,
                    );
                    if (!paidAt.ok) {
                      setMessage(paidAt.message);
                      setRequestingApproval(false);
                      return;
                    }
                    const res = await fetch(`/api/cs/confirmations/${confirmationId}/deposit-approval`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        depositAmount: depositAmount.trim() === "" ? null : depositAmount.trim(),
                        depositPayMethod: depositPayMethod || null,
                        depositFromNumber: depositFromNumber.trim() || null,
                        depositInstapayName: depositPayMethod === "instapay" ? depositInstapayName.trim() || null : null,
                        depositToPhone: to.phone || null,
                        depositToMethod: to.method || null,
                        depositPaidAt: paidAt.iso,
                        depositProofUrl: null,
                      }),
                    });
                    const data = (await res.json()) as { message?: string };
                    setRequestingApproval(false);
                    if (!res.ok) {
                      setMessage(data.message || "تعذر إرسال طلب الموافقة.");
                      return;
                    }
                    setDepositApprovalStatus("pending");
                    setMessage("تم إرسال طلب الموافقة للأدمن.");
                  })();
                }}
                className="w-full rounded-lg bg-[#0D9488] px-2 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-50"
              >
                {depositApprovalStatus === "pending" ? "بانتظار الرد…" : "طلب موافقه"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex min-h-[7.5rem] flex-col rounded-xl bg-[#14213D]/10 p-2.5 shadow-sm ring-2 ring-[#14213D]">
          <p className="text-xs font-extrabold text-[#14213D]">رقم التراك</p>
          <p className="mt-0.5 text-[10px] text-[#14213D]/60">اختياري — ليس شرطاً للحفظ</p>
          <input
            dir="ltr"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Tracking"
            className={`mt-2 ${inputCls}`}
          />
        </div>

        {lockedShipping === "bosta" ? (
          <div className="flex min-h-[7.5rem] flex-col rounded-xl bg-[#14213D] p-2.5 text-white shadow-sm ring-2 ring-[#FCA311]">
            <p className="text-xs font-extrabold text-[#FCA311]">شحنة بوسطة</p>
            <p dir="ltr" className="mt-1 text-sm font-extrabold">{trackingNumber || "—"}</p>
            <p className="mt-1 text-sm font-extrabold">{bostaStatus ? getBostaStatusLabelAr(bostaStatus) : "لسه مفيش بوليصة"}</p>
            <p className="mt-1 text-xs font-bold">
              قيمة الشحن: {bostaFee == null ? "—" : `${bostaFee.toLocaleString("ar-EG")} ج.م`}
            </p>
            <p className="mt-1 text-xs font-bold">
              التحصيل: {bostaCod == null ? "—" : `${bostaCod.toLocaleString("ar-EG")} ج.م`}
            </p>
            {bostaLastEvent ? <p className="mt-1 text-[10px] font-bold text-white/90">{bostaLastEvent}</p> : null}
            <p className="mt-1 text-[10px] text-white/70">
              آخر تحديث:{" "}
              {bostaSyncedAt ? new Date(bostaSyncedAt).toLocaleString("ar-EG") : "—"}
            </p>
            {bostaError ? <p className="mt-1 text-[10px] font-bold text-[#FCA311]">{bostaError}</p> : null}
          </div>
        ) : null}

        <div className="flex min-h-[7.5rem] flex-col rounded-xl bg-[#059669]/15 p-2.5 shadow-sm ring-2 ring-[#059669]">
          <p className="text-xs font-extrabold text-[#14213D]">طباعة البوليصة</p>
          <p className="mt-0.5 text-[10px] text-[#14213D]/60">اختياري — للفلترة فقط</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setWaybillPrinted(true)}
              className={`${compactBtn} ${
                waybillPrinted ? "bg-[#059669] text-white" : "bg-white text-[#14213D]"
              }`}
            >
              نعم
            </button>
            <button
              type="button"
              onClick={() => setWaybillPrinted(false)}
              className={`${compactBtn} ${
                !waybillPrinted ? "bg-[#14213D] text-white" : "bg-white text-[#14213D]"
              }`}
            >
              لا
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
