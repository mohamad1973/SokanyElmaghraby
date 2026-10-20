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
import {
  BOSTA_TRACK_STAGES,
  bostaTrackMarker,
  getBostaStatusLabelAr,
  normalizeBostaStatus,
  type BostaTrackEvent,
} from "@/lib/shipping/bosta-zones";

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
  fulfillmentKind?: string;
  parentConfirmationId?: number;
  parentWooOrderNumber?: string;
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
  discountApprovalStatus?: string | null;
  postCancel?: {
    invoice: "before" | "after" | "";
    systemNo: string | null;
    refundPaid: boolean;
    at: string | null;
  };
  confirmedAt?: string | null;
  confirmationEditedAt?: string | null;
  orderTotalDelta?: number | null;
  canApproveItems?: boolean;
  canEditSavedInfo?: boolean;
  maintenanceTechNote?: string | null;
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

function formatTrackAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function currentTrackEvent(status: string, events: BostaTrackEvent[]) {
  const key = normalizeBostaStatus(status);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (normalizeBostaStatus(events[index]?.status) === key) return events[index];
  }
  return events.length ? events[events.length - 1] : null;
}

function BostaTrackLine({
  status,
  events,
  trackingNumber,
  hideEvents,
}: {
  status: string;
  events: BostaTrackEvent[];
  trackingNumber: string;
  hideEvents: boolean;
}) {
  const shownEvents = hideEvents ? [] : events;
  const marker = bostaTrackMarker(status, shownEvents);
  const spot = shownEvents.length ? currentTrackEvent(status, shownEvents) : null;
  const liveLabel = status ? getBostaStatusLabelAr(status) : "";
  const spotText = spot
    ? [spot.place, spot.at ? formatTrackAt(spot.at) : ""].filter(Boolean).join(" · ")
    : "";

  return (
    <section className="rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/15">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-extrabold text-[#14213D]">تتبع بوسطة</p>
        {trackingNumber.trim() ? (
          <p className="text-xs font-bold text-[#14213D]/70" dir="ltr">
            {trackingNumber.trim()}
          </p>
        ) : null}
      </div>
      {!trackingNumber.trim() ? (
        <p className="mt-2 text-sm font-bold text-[#14213D]/70">لسه مفيش بوليصة</p>
      ) : (
        <>
          <div className="relative mt-3 overflow-x-auto pb-1">
          <div className="pointer-events-none absolute inset-x-8 top-3.5 h-0.5 bg-[#14213D]/15" />
          <ol className="relative flex gap-1">
            {BOSTA_TRACK_STAGES.map((label, index) => {
              const done = marker.exception
                ? marker.reached >= 0 && index <= marker.reached
                : marker.active >= 0 && index < marker.active;
              const current = index === marker.active;
              return (
                <li key={label} className="flex min-w-24 flex-1 flex-col items-center text-center">
                  <span
                    className={`relative z-10 grid size-7 place-items-center rounded-full text-[11px] font-extrabold ${
                      current
                        ? "bg-[#FCA311] text-black ring-2 ring-[#14213D]"
                        : done
                          ? "bg-[#14213D] text-white"
                          : "bg-[#E5E5E5] text-[#14213D]/40"
                    }`}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <span
                    className={`mt-1 text-[10px] font-extrabold leading-4 ${
                      current || done ? "text-[#14213D]" : "text-[#14213D]/40"
                    }`}
                  >
                    {label}
                  </span>
                  {current ? (
                    <span className="mt-1 text-[10px] font-bold leading-4 text-[#14213D]">
                      الآن
                      {liveLabel && liveLabel !== label ? ` · ${liveLabel}` : ""}
                      {spotText ? ` · ${spotText}` : ""}
                    </span>
                  ) : null}
                </li>
              );
            })}
            {marker.exception ? (
              <li className="flex min-w-28 flex-1 flex-col items-center text-center">
                <span className="relative z-10 grid size-7 place-items-center rounded-full bg-red-700 text-[11px] font-extrabold text-white ring-2 ring-red-900">
                  !
                </span>
                <span className="mt-1 text-[10px] font-extrabold leading-4 text-red-800">{liveLabel}</span>
                <span className="mt-1 text-[10px] font-bold leading-4 text-red-800">
                  الآن{spotText ? ` · ${spotText}` : ""}
                </span>
              </li>
            ) : null}
          </ol>
          </div>
          {!hideEvents && events.length ? (
            <ol className="mt-3 grid gap-1 border-t border-[#14213D]/10 pt-2 text-xs font-bold text-[#14213D]">
              {events.map((event, index) => (
                <li key={`${event.at}-${event.status}-${index}`} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {event.label}
                    {event.place ? ` — ${event.place}` : ""}
                  </span>
                  {event.at ? (
                    <span className="text-[#14213D]/60" dir="ltr">
                      {formatTrackAt(event.at)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
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
  discountApprovalStatus: initialDiscountApprovalStatus,
  postCancel,
  confirmedAt,
  confirmationEditedAt,
  orderTotalDelta: initialOrderTotalDelta,
  canApproveItems = false,
  canEditSavedInfo = false,
  maintenanceTechNote = null,
}: Props) {
  const confirmed = status === "CONFIRMED";
  const showFollowUp = confirmed || Boolean(postCancel?.at);
  const lockedShipping =
    shippingCompany === "bosta" ||
    shippingCompany === "sayed_temima" ||
    shippingCompany === "eid" ||
    shippingCompany === "momen"
      ? shippingCompany
      : null;

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
  const [bostaEvents, setBostaEvents] = useState<BostaTrackEvent[]>([]);

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
          governorate?: string | null;
          events?: BostaTrackEvent[];
        };
        if (!res.ok) {
          setBostaEvents([]);
          setBostaError(data.message || data.bostaSyncError || "تعذر جلب بوليصة بوسطة.");
          return;
        }
        if (data.trackingNumber) setTrackingNumber(data.trackingNumber);
        if (data.bostaStatus) setBostaStatus(data.bostaStatus);
        if (data.bostaShippingFee !== undefined && data.bostaShippingFee !== null) setBostaFee(data.bostaShippingFee);
        if (data.bostaSyncedAt) setBostaSyncedAt(data.bostaSyncedAt);
        if (data.cod !== undefined && data.cod !== null) setBostaCod(data.cod);
        if (data.lastEvent) setBostaLastEvent(data.lastEvent);
        setBostaEvents(Array.isArray(data.events) ? data.events : []);
        const governorate = String(data.governorate || "").trim();
        if (governorate) {
          setAnswers((prev) => ({
            ...prev,
            governorate_confirm: {
              confirmed: true,
              value: governorate,
              note: prev.governorate_confirm?.note || "",
              yesNo: prev.governorate_confirm?.yesNo || "",
            },
          }));
          setSnapshot((prev) => (prev ? { ...prev, governorate } : prev));
        }
        setBostaError(data.bostaSyncError || "");
      })
        .catch((error: unknown) => {
        if (ac.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setBostaEvents([]);
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
  const [depositOpen, setDepositOpen] = useState(false);
  const [postInvoice, setPostInvoice] = useState<"before" | "after" | "">(
    () => postCancel?.invoice || "",
  );
  const [postSystemNo, setPostSystemNo] = useState(() => String(postCancel?.systemNo || "").trim());
  const [postRefundPaid, setPostRefundPaid] = useState(Boolean(postCancel?.refundPaid));
  const initialDelta = splitOrderTotalDelta(initialOrderTotalDelta);
  const [discountAmount, setDiscountAmount] = useState(() =>
    initialDelta.sign === "minus" ? initialDelta.amount : "",
  );
  const [discountApprovalStatus, setDiscountApprovalStatus] = useState(() => {
    const s = String(initialDiscountApprovalStatus || "").trim().toLowerCase();
    if (s === "pending" || s === "approved" || s === "rejected") return s;
    return initialDelta.sign === "minus" && initialDelta.amount ? "approved" : "none";
  });
  const [requestingDiscountApproval, setRequestingDiscountApproval] = useState(false);
  const [extraPhoneOpen, setExtraPhoneOpen] = useState(() => {
    const extra = initialAnswers.find((a) => a.itemKey === "extra_phone");
    if (String(extra?.value || "").trim()) return true;
    const legacy = initialAnswers.find((a) => a.itemKey === "alt_phone");
    return Boolean(legacy && legacy.value !== "no" && String(legacy.note || "").trim());
  });
  const [extraPhone, setExtraPhone] = useState(() => {
    const extra = initialAnswers.find((a) => a.itemKey === "extra_phone");
    const fromExtra = String(extra?.value || "").trim();
    if (fromExtra) return fromExtra;
    const legacy = initialAnswers.find((a) => a.itemKey === "alt_phone");
    if (legacy && legacy.value !== "no") return String(legacy.note || "").trim();
    return "";
  });
  const [missing, setMissing] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [itemHits, setItemHits] = useState<Array<{ id: number; name: string; price: string; sku: string; displayCode: string }>>([]);
  const [itemQty, setItemQty] = useState("1");
  const [pendingAdds, setPendingAdds] = useState<
    Array<{
      id: number;
      kind: "add" | "remove";
      productName: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      status: string;
      wooProductId: number;
    }>
  >([]);
  const [itemBusy, setItemBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheetDayPrompt, setSheetDayPrompt] = useState<{
    message: string;
    finalize: boolean;
    failContact: boolean;
    cancelOrder: boolean;
  } | null>(null);

  const when = formatCairoOrderDateTime(snapshot?.dateCreated);
  const savedWhen = confirmedAt ? formatCairoOrderDateTime(confirmedAt) : null;
  const editedWhen = confirmationEditedAt ? formatCairoOrderDateTime(confirmationEditedAt) : null;
  const wooTotal = Number(String(snapshot?.total || "").replace(/,/g, ""));
  const discountAbs = Number(String(discountAmount).replace(/,/g, "").trim());
  const signedDelta =
    !String(discountAmount).trim() || !Number.isFinite(discountAbs) || discountAbs <= 0 ? 0 : -discountAbs;
  const adjustedTotal = Math.max(0, (Number.isFinite(wooTotal) ? wooTotal : 0) + signedDelta);
  const typedDeposit = Number(depositAmount.replace(/,/g, "").trim());
  const depositPayLabel =
    depositAmount.trim() !== "" && Number.isFinite(typedDeposit) && typedDeposit > 0
      ? typedDeposit + 0.001 >= adjustedTotal
        ? "مدفوع بالكامل"
        : "مدفوع جزئي"
      : null;
  const lockRecorded = showFollowUp && !canEditSavedInfo;
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

  const payloadAnswers: CsChecklistAnswerInput[] = useMemo(() => {
    const base = CS_CHECKLIST_ITEMS.map((item) => {
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
    });
    const phone = extraPhoneOpen ? extraPhone.trim() : "";
    base.push({
      itemKey: "extra_phone",
      confirmed: Boolean(phone),
      value: phone || null,
      note: null,
      yesNo: null,
    });
    return base;
  }, [answers, lockedShipping, extraPhone, extraPhoneOpen]);

  function update(key: string, patch: Partial<AnswerState>) {
    setAnswers((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function save(
    finalize: boolean,
    failContact = false,
    cancelOrder = false,
    sheetDayChoice?: "previous" | "today",
  ) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    if (sheetDayChoice) setSheetDayPrompt(null);
    if (finalize && !failContact && !cancelOrder && !confirmed) {
      if (!lockedShipping) {
        setSaving(false);
        setMessage("يجب أن تحدد المشرفة شركة الشحن أولاً من قائمة الأوردرات.");
        setMissing(["shipping_company"]);
        return;
      }
      const validation = validateChecklistAnswers(payloadAnswers, {
        shippingCompany: lockedShipping,
      });
      setMissing(validation.missing);
      if (!validation.ok) {
        setSaving(false);
        setMessage(
          lockedShipping === "bosta" || lockedShipping === "eid" || lockedShipping === "momen"
            ? "لازم شركة الشحن تكون محددة قبل الحفظ النهائي."
            : "استكمل البنود الناقصة قبل الحفظ النهائي.",
        );
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

    if (finalize && !failContact && !cancelOrder && !showFollowUp) {
      const typedDeposit = Number(depositAmount.replace(/,/g, "").trim());
      const hasDeposit = depositAmount.trim() !== "" && Number.isFinite(typedDeposit) && typedDeposit > 0;
      if (hasDeposit) {
        const approvedAmount = Number(initialDepositAmount);
        const matchesApproved =
          depositApprovalStatus === "approved" &&
          Number.isFinite(approvedAmount) &&
          Math.abs(approvedAmount - typedDeposit) < 0.001;
        if (!matchesApproved) {
          setSaving(false);
          setMessage(
            depositApprovalStatus === "approved"
              ? "اطلب الموافقة على قيمة الديبوزت الجديدة."
              : "لا يُحفظ الأوردر قبل موافقة الديبوزت.",
          );
          return;
        }
      }
      const typedDiscount = Number(discountAmount.replace(/,/g, "").trim());
      const hasDiscount = discountAmount.trim() !== "" && Number.isFinite(typedDiscount) && typedDiscount > 0;
      if (hasDiscount) {
        const approvedDiscount = Math.abs(Number(initialOrderTotalDelta));
        const matchesApproved =
          discountApprovalStatus === "approved" &&
          Number.isFinite(approvedDiscount) &&
          approvedDiscount > 0 &&
          Math.abs(approvedDiscount - typedDiscount) < 0.001;
        if (!matchesApproved) {
          setSaving(false);
          setMessage(
            discountApprovalStatus === "approved"
              ? "اطلب الموافقة على قيمة الخصم الجديدة."
              : "لا يُحفظ الأوردر قبل موافقة الخصم.",
          );
          return;
        }
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
        orderTotalDelta:
          discountApprovalStatus === "approved" && signedDelta < 0
            ? signedDelta
            : discountAmount.trim() === ""
              ? null
              : undefined,
        postCancel:
          showFollowUp && postRefundPaid
            ? { invoice: postInvoice, systemNo: postSystemNo, refundPaid: true }
            : undefined,
        followUp: showFollowUp ? fu : undefined,
        sheetDayChoice,
      }),
    });
    const data = (await res.json()) as {
      message?: string;
      missing?: string[];
      needsSheetDayChoice?: boolean;
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

    if (data.needsSheetDayChoice) {
      setSheetDayPrompt({
        message: data.message || "الشيت كان مقفول على الأوردر في يوم سابق.",
        finalize,
        failContact,
        cancelOrder,
      });
      return;
    }

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
    if (data.bostaMessage || data.trackingNumber) setWaybillPrinted(false);
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
  const [printingWaybill, setPrintingWaybill] = useState(false);
  const [waybillCreatePrompt, setWaybillCreatePrompt] = useState(false);
  const [creatingWaybill, setCreatingWaybill] = useState(false);

  const isFulfillmentChild = Boolean(
    snapshot &&
      ((snapshot as Snapshot).parentConfirmationId ||
        (snapshot as Snapshot).fulfillmentKind === "return" ||
        (snapshot as Snapshot).fulfillmentKind === "exchange"),
  );
  const canCreateFulfillment =
    !isFulfillmentChild &&
    Boolean(confirmed) &&
    (lockedShipping === "sayed_temima" ||
      lockedShipping === "eid" ||
      lockedShipping === "momen" ||
      Boolean(shippingCompany === "eid" || shippingCompany === "momen" || shippingCompany === "sayed_temima"));

  type FulfillmentChild = {
    id: number;
    wooOrderNumber: string;
    kind: "return" | "exchange";
    trackingNumber: string | null;
    shippingCompany: string | null;
  };
  type MonaCourierOpt = { id: number; name: string; bucket: "eid" | "momen" | null };
  const [fulfillmentKind, setFulfillmentKind] = useState<"return" | "exchange">("exchange");
  const [fulfillmentDesk, setFulfillmentDesk] = useState<"sayed_temima" | "eid" | "momen">(
    lockedShipping === "eid" || lockedShipping === "momen" || lockedShipping === "sayed_temima"
      ? lockedShipping
      : "sayed_temima",
  );
  const [fulfillmentCourierId, setFulfillmentCourierId] = useState("");
  const [fulfillmentCollect, setFulfillmentCollect] = useState("");
  const [fulfillmentOutboundQ, setFulfillmentOutboundQ] = useState("");
  const [fulfillmentReturnQ, setFulfillmentReturnQ] = useState("");
  const [fulfillmentOutbound, setFulfillmentOutbound] = useState<{
    productId: number | null;
    name: string;
    sku: string;
  } | null>(null);
  const [fulfillmentReturning, setFulfillmentReturning] = useState<{
    productId: number | null;
    name: string;
    sku: string;
  } | null>(null);
  const [fulfillmentHits, setFulfillmentHits] = useState<
    Array<{ id: number; name: string; sku: string; price: string }>
  >([]);
  const [fulfillmentHitTarget, setFulfillmentHitTarget] = useState<"out" | "back" | null>(null);
  const [fulfillmentBusy, setFulfillmentBusy] = useState(false);
  const [fulfillmentChildren, setFulfillmentChildren] = useState<FulfillmentChild[]>([]);
  const [monaCouriers, setMonaCouriers] = useState<MonaCourierOpt[]>([]);

  useEffect(() => {
    if (!canCreateFulfillment) return;
    void fetch(`/api/cs/confirmations/${confirmationId}/fulfillment`)
      .then((res) => res.json())
      .then(
        (data: {
          items?: FulfillmentChild[];
          couriers?: MonaCourierOpt[];
        }) => {
          setFulfillmentChildren(data.items || []);
          setMonaCouriers(data.couriers || []);
        },
      )
      .catch(() => {
        // ignore
      });
  }, [canCreateFulfillment, confirmationId]);

  useEffect(() => {
    const query = fulfillmentHitTarget === "out" ? fulfillmentOutboundQ : fulfillmentReturnQ;
    if (!fulfillmentHitTarget || query.trim().length < 2) {
      setFulfillmentHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/products/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => res.json())
        .then((data: { products?: Array<{ id: number; name: string; price: string; sku?: string }> }) => {
          setFulfillmentHits(
            (data.products || []).slice(0, 8).map((product) => ({
              id: product.id,
              name: product.name,
              sku: product.sku || "",
              price: String(product.price || "0"),
            })),
          );
        })
        .catch(() => setFulfillmentHits([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fulfillmentHitTarget, fulfillmentOutboundQ, fulfillmentReturnQ]);

  async function printFulfillmentWaybill(childId: number, tracking: string | null) {
    if (!tracking) {
      setMessage("مفيش رقم تتبع بوسطة للطباعة. حاول الحفظ مرة أخرى بعد إنشاء البوليصة.");
      return;
    }
    const preview = window.open("", "bosta-awb");
    setMessage("");
    const res = await fetch(`/api/cs/confirmations/${childId}/bosta-awb`);
    if (!res.ok) {
      preview?.close();
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      setMessage(data?.message || "تعذر طباعة بوليصة الاستبدال/الاسترجاع.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (preview) {
      preview.location.href = url;
      preview.focus();
    } else {
      window.open(url, "_blank");
    }
    void fetch(`/api/cs/confirmations/${childId}/bosta-awb`, { method: "POST" });
  }

  async function submitFulfillment() {
    setFulfillmentBusy(true);
    setMessage("");
    const res = await fetch(`/api/cs/confirmations/${confirmationId}/fulfillment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: fulfillmentKind,
        desk: fulfillmentDesk,
        monaCourierId: fulfillmentCourierId ? Number(fulfillmentCourierId) : null,
        collectAmount: fulfillmentCollect.trim() || "0",
        outbound:
          fulfillmentKind === "exchange" && fulfillmentOutbound
            ? {
                productId: fulfillmentOutbound.productId,
                name: fulfillmentOutbound.name,
                sku: fulfillmentOutbound.sku,
                quantity: 1,
              }
            : null,
        returning: fulfillmentReturning
          ? {
              productId: fulfillmentReturning.productId,
              name: fulfillmentReturning.name,
              sku: fulfillmentReturning.sku,
              quantity: 1,
            }
          : null,
        phone: snapshot?.phone || answers.primary_phone?.value || "",
        address: snapshot?.address || answers.address_complete?.value || "",
        governorate: snapshot?.governorate || answers.governorate_confirm?.value || "",
        area: snapshot?.area || answers.area_confirm?.value || "",
        customerName: snapshot?.customerName || answers.customer_name?.value || "",
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      message?: string;
      confirmationId?: number;
      wooOrderNumber?: string;
      trackingNumber?: string | null;
      kind?: "return" | "exchange";
    } | null;
    setFulfillmentBusy(false);
    if (data?.confirmationId) {
      setFulfillmentChildren((prev) => [
        {
          id: data.confirmationId!,
          wooOrderNumber: data.wooOrderNumber || String(data.confirmationId),
          kind: data.kind || fulfillmentKind,
          trackingNumber: data.trackingNumber || null,
          shippingCompany: fulfillmentDesk,
        },
        ...prev.filter((row) => row.id !== data.confirmationId),
      ]);
    }
    if (!res.ok || !data?.confirmationId || !data.trackingNumber) {
      setMessage(
        data?.message ||
          (!data?.trackingNumber && data?.confirmationId
            ? "تم حفظ الأوردر لكن تعذر إنشاء بوليصة بوسطة — لا يمكن الطباعة."
            : "تعذر إنشاء الاستبدال/الاسترجاع."),
      );
      return;
    }
    setMessage(
      `تم إنشاء ${fulfillmentKind === "exchange" ? "استبدال" : "استرجاع"} #${data.wooOrderNumber} وبوليصة بوسطة.`,
    );
    void printFulfillmentWaybill(data.confirmationId, data.trackingNumber);
  }

  function fulfillmentCard() {
    if (!canCreateFulfillment) return null;
    const deskCouriers = monaCouriers.filter((row) => row.bucket === fulfillmentDesk);
    const originalItems = snapshot?.items || [];
    return (
      <div className="rounded-2xl bg-[#FFF8E7] p-3 shadow-sm ring-2 ring-inset ring-[#FCA311]">
        <p className="text-sm font-extrabold text-[#14213D]">استبدال / استرجاع</p>
        <p className="mt-0.5 text-[11px] font-bold text-[#14213D]/70">
          لا يغيّر الأوردر الأصلي — ينشئ بوليصة مرتبطة فقط ويطبعها من بوسطة، وتظهر في حساب تميمة أو عيد أو مؤمن. رسوم الشحن عند تم بنجاح.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["exchange", "استبدال"],
                ["return", "استرجاع"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFulfillmentKind(value)}
                className={`${compactBtn} ${
                  fulfillmentKind === value ? "bg-[#14213D] text-white" : "bg-white text-[#14213D] ring-1 ring-[#E5E5E5]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["sayed_temima", "سيد تميمة"],
                ["eid", "عيد"],
                ["momen", "مؤمن"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFulfillmentDesk(value);
                  setFulfillmentCourierId("");
                }}
                className={`${compactBtn} ${
                  fulfillmentDesk === value ? "bg-[#FCA311] text-black" : "bg-white text-[#14213D] ring-1 ring-[#E5E5E5]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {fulfillmentDesk === "eid" || fulfillmentDesk === "momen" ? (
          <label className="mt-2 block text-[11px] font-extrabold text-[#14213D]">
            المندوب
            <select
              value={fulfillmentCourierId}
              onChange={(e) => setFulfillmentCourierId(e.target.value)}
              className={`${inputCls} mt-1`}
            >
              <option value="">اختَر المندوب</option>
              {deskCouriers.map((courier) => (
                <option key={courier.id} value={String(courier.id)}>
                  {courier.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="mt-2 block text-[11px] font-extrabold text-[#14213D]">
          {fulfillmentKind === "return" ? "المبلغ اللي هيتدفع للعميل" : "قيمة التحصيل (+) أو رد الفرق (−)"}
          <input
            dir="ltr"
            inputMode="decimal"
            value={fulfillmentCollect}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.\-]/g, "");
              const cleaned = raw.replace(/(?!^)-/g, "").replace(/(\..*)\./g, "$1");
              setFulfillmentCollect(cleaned);
            }}
            placeholder="0 أو -150"
            className={`${inputCls} mt-1`}
          />
          <span className="mt-0.5 block text-[10px] font-bold text-[#14213D]/65">
            {fulfillmentKind === "return"
              ? "الاسترجاع ينقص حساب المندوب لأنه يدفع للعميل. بوليصة بوسطة تبقى استرجاع، والأصناف تظهر في وصف الشحنة، ومبلغ التحصيل على الطباعة صفر."
              : "موجب = مبلغ التحصيل على بوليصة استبدال بوسطة · سالب = رد فرق ينقص الحساب من غير تحصيل من العميل"}
          </span>
        </label>
        {fulfillmentKind === "exchange" ? (
          <div className="mt-2">
            <p className="text-[11px] font-extrabold text-[#14213D]">منتج خارج (هيستبدل به)</p>
            <input
              value={fulfillmentOutboundQ}
              onChange={(e) => {
                setFulfillmentOutboundQ(e.target.value);
                setFulfillmentHitTarget("out");
              }}
              placeholder="ابحث باسم المنتج"
              className={`${inputCls} mt-1`}
            />
            {fulfillmentOutbound ? (
              <p className="mt-1 text-[11px] font-bold text-emerald-800">{fulfillmentOutbound.name}</p>
            ) : null}
            {fulfillmentHitTarget === "out" && fulfillmentHits.length ? (
              <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg bg-white ring-1 ring-[#E5E5E5]">
                {fulfillmentHits.map((hit) => (
                  <li key={`out-${hit.id}`}>
                    <button
                      type="button"
                      className="block w-full px-2 py-1.5 text-right text-[11px] font-bold hover:bg-[#F5F5F0]"
                      onClick={() => {
                        setFulfillmentOutbound({ productId: hit.id, name: hit.name, sku: hit.sku });
                        setFulfillmentOutboundQ(hit.name);
                        setFulfillmentHits([]);
                        setFulfillmentHitTarget(null);
                      }}
                    >
                      {hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="mt-2">
          <p className="text-[11px] font-extrabold text-[#14213D]">منتج راجع من العميل</p>
          {originalItems.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {originalItems.map((item, index) => (
                <button
                  key={`orig-${index}`}
                  type="button"
                  onClick={() =>
                    setFulfillmentReturning({
                      productId: null,
                      name: item.name,
                      sku: item.sku || "",
                    })
                  }
                  className={`${compactBtn} bg-white text-[#14213D] ring-1 ring-[#E5E5E5]`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}
          <input
            value={fulfillmentReturnQ}
            onChange={(e) => {
              setFulfillmentReturnQ(e.target.value);
              setFulfillmentHitTarget("back");
            }}
            placeholder="أو ابحث عن منتج تاني"
            className={`${inputCls} mt-1`}
          />
          {fulfillmentReturning ? (
            <p className="mt-1 text-[11px] font-bold text-emerald-800">{fulfillmentReturning.name}</p>
          ) : null}
          {fulfillmentHitTarget === "back" && fulfillmentHits.length ? (
            <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg bg-white ring-1 ring-[#E5E5E5]">
              {fulfillmentHits.map((hit) => (
                <li key={`back-${hit.id}`}>
                  <button
                    type="button"
                    className="block w-full px-2 py-1.5 text-right text-[11px] font-bold hover:bg-[#F5F5F0]"
                    onClick={() => {
                      setFulfillmentReturning({ productId: hit.id, name: hit.name, sku: hit.sku });
                      setFulfillmentReturnQ(hit.name);
                      setFulfillmentHits([]);
                      setFulfillmentHitTarget(null);
                    }}
                  >
                    {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="mt-2 text-[10px] font-bold text-[#14213D]/60" dir="ltr">
          {snapshot?.phone || answers.primary_phone?.value || "—"} ·{" "}
          {snapshot?.customerName || answers.customer_name?.value || "—"}
        </p>
        <button
          type="button"
          disabled={fulfillmentBusy}
          onClick={() => void submitFulfillment()}
          className="mt-2 w-full rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white disabled:opacity-60"
        >
          {fulfillmentBusy ? "جاري الحفظ…" : "حفظ وطباعة البوليصة"}
        </button>
        {fulfillmentChildren.length ? (
          <ul className="mt-2 space-y-1">
            {fulfillmentChildren.map((child) => (
              <li
                key={child.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-[11px] font-bold"
              >
                <Link href={`/cs/orders/${child.id}`} className="underline">
                  #{child.wooOrderNumber} · {child.kind === "exchange" ? "استبدال" : "استرجاع"}
                </Link>
                <button
                  type="button"
                  disabled={!child.trackingNumber}
                  className="rounded-lg bg-[#059669] px-2 py-1 text-[10px] font-extrabold text-white disabled:opacity-40"
                  onClick={() => void printFulfillmentWaybill(child.id, child.trackingNumber)}
                >
                  {child.trackingNumber ? "طباعة" : "بدون بوليصة"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  async function printWaybillPdf(currentTracking: string) {
    if (!currentTracking.trim()) {
      setWaybillCreatePrompt(true);
      return;
    }
    const preview = window.open("", "bosta-awb");
    setPrintingWaybill(true);
    setMessage("");
    const res = await fetch(`/api/cs/confirmations/${confirmationId}/bosta-awb`);
    if (!res.ok) {
      preview?.close();
      const data = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
      setPrintingWaybill(false);
      if (data?.code === "missing_waybill" || /مفيش بوليصة|غير موجود|not found|404/i.test(data?.message || "")) {
        setWaybillCreatePrompt(true);
        setMessage("");
        return;
      }
      setMessage(data?.message || "تعذر طباعة بوليصة بوسطة.");
      return;
    }
    const blob = await res.blob();
    const signature = new TextDecoder().decode(await blob.slice(0, 4).arrayBuffer());
    if (signature !== "%PDF") {
      preview?.close();
      setPrintingWaybill(false);
      setMessage("بوسطة أنشأت البوليصة من غير ملف للطباعة.");
      return;
    }
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    let marked = false;
    const release = (target: Window | null, frame?: HTMLIFrameElement) => {
      window.setTimeout(() => {
        frame?.remove();
        if (target && !target.closed) target.close();
        URL.revokeObjectURL(url);
      }, 1500);
    };
    const markPrinted = () => {
      if (marked) return;
      marked = true;
      setPrintingWaybill(false);
      setWaybillPrinted(true);
      setMessage("البوليصة اتطبعت. تقدر تحفظ الأوردر.");
      void fetch(`/api/cs/confirmations/${confirmationId}/bosta-awb`, { method: "POST" });
    };
    const printWhenReady = (target: Window, frame?: HTMLIFrameElement, alreadyLoaded = false) => {
      let started = false;
      const arm = () => {
        if (started || target.closed) return;
        started = true;
        window.setTimeout(() => {
          if (target.closed) {
            setPrintingWaybill(false);
            setMessage("اتقفلت نافذة الطباعة قبل ما البوليصة تطبع.");
            URL.revokeObjectURL(url);
            return;
          }
          target.focus();
          try {
            target.print();
          } catch {
            setPrintingWaybill(false);
            setMessage("تعذر فتح نافذة الطباعة.");
            release(target, frame);
            return;
          }
          markPrinted();
          target.addEventListener("afterprint", () => release(target, frame), { once: true });
        }, 900);
      };
      if (alreadyLoaded) {
        arm();
        return;
      }
      target.addEventListener("load", arm);
      window.setTimeout(arm, 1600);
    };
    if (preview && !preview.closed) {
      printWhenReady(preview);
      preview.location.href = url;
      return;
    }
    const frame = document.createElement("iframe");
    frame.setAttribute("title", "طباعة البوليصة");
    frame.style.position = "fixed";
    frame.style.inset = "0";
    frame.style.zIndex = "80";
    frame.style.width = "100%";
    frame.style.height = "100%";
    frame.style.border = "0";
    frame.style.background = "#fff";
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        setPrintingWaybill(false);
        setMessage("تعذر فتح نافذة الطباعة.");
        frame.remove();
        URL.revokeObjectURL(url);
        return;
      }
      printWhenReady(win, frame, true);
    };
    document.body.appendChild(frame);
    frame.src = url;
  }

  async function printWaybill() {
    await printWaybillPdf(trackingNumber);
  }

  async function createWaybillAndPrint() {
    if (creatingWaybill || printingWaybill) return;
    setCreatingWaybill(true);
    setMessage("");
    const res = await fetch(`/api/cs/confirmations/${confirmationId}/bosta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      trackingNumber?: string | null;
      bostaStatus?: string | null;
      bostaShippingFee?: number | null;
      bostaSyncedAt?: string | null;
      bostaSyncError?: string | null;
      cod?: number | null;
    };
    setCreatingWaybill(false);
    if (!res.ok || !data.trackingNumber) {
      setMessage(data.message || data.bostaSyncError || "تعذر إنشاء بوليصة بوسطة.");
      return;
    }
    setTrackingNumber(data.trackingNumber);
    if (data.bostaStatus) setBostaStatus(data.bostaStatus);
    if (data.bostaShippingFee !== undefined && data.bostaShippingFee !== null) setBostaFee(data.bostaShippingFee);
    if (data.bostaSyncedAt) setBostaSyncedAt(data.bostaSyncedAt);
    if (data.cod !== undefined && data.cod !== null) setBostaCod(data.cod);
    setBostaError("");
    setWaybillCreatePrompt(false);
    setMessage(data.message || "تم إنشاء البوليصة وربطها بالأوردر.");
    await printWaybillPdf(data.trackingNumber);
  }

  useEffect(() => {
    let stop = false;
    void fetch(`/api/cs/confirmations/${confirmationId}/item-add`)
      .then((res) => res.json())
      .then((data: { adds?: typeof pendingAdds }) => {
        if (!stop) setPendingAdds(data.adds || []);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [confirmationId]);

  useEffect(() => {
    const query = itemQuery.trim();
    if (query.length < 2) {
      setItemHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetch(`/api/products/search?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data: { products?: Array<{ id: number; name: string; price: string; sku?: string; displayCode?: string }> }) => {
          setItemHits(
            (data.products || []).map((product) => ({
              id: product.id,
              name: product.name,
              price: String(product.price || "0"),
              sku: product.sku || "",
              displayCode: product.displayCode || product.sku || "",
            })),
          );
        })
        .catch(() => setItemHits([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [itemQuery]);

  async function requestItem(body: {
    kind: "add" | "remove";
    wooProductId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
  }) {
    setItemBusy(true);
    const res = await fetch(`/api/cs/confirmations/${confirmationId}/item-add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { message?: string; adds?: typeof pendingAdds };
    setItemBusy(false);
    setMessage(data.message || (res.ok ? "اتبعت الطلب." : "تعذر إرسال الطلب."));
    if (!res.ok) return;
    const listed = await fetch(`/api/cs/confirmations/${confirmationId}/item-add`);
    const next = (await listed.json()) as { adds?: typeof pendingAdds };
    setPendingAdds(next.adds || []);
    setItemQuery("");
    setItemHits([]);
  }

  async function decideItem(id: number, decision: "approved" | "rejected") {
    setItemBusy(true);
    const res = await fetch(`/api/cs/item-adds/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = (await res.json()) as { message?: string };
    setItemBusy(false);
    setMessage(data.message || (res.ok ? "تم." : "تعذر حفظ القرار."));
    if (res.ok && decision === "approved") window.location.reload();
    if (res.ok && decision === "rejected") {
      setPendingAdds((rows) => rows.map((row) => (row.id === id ? { ...row, status: "rejected" } : row)));
    }
  }

  const checklistVisible = CS_CHECKLIST_ITEMS.filter((item) => item.key !== "shipping_company");

  function infoCards(locked: boolean) {
    return checklistVisible.map((item) => {
          const state = answers[item.key];
          const isMissing = missing.includes(item.key);
          return (
            <div
              key={item.key}
              className={`flex flex-col rounded-xl bg-white p-1.5 shadow-sm ring-2 ${
                isMissing ? "ring-red-500" : "ring-[#E5E5E5]"
              }`}
            >
              <label className="flex items-center justify-between gap-1">
                <span className="min-w-0 text-xs font-extrabold leading-4 text-[#14213D]">{item.label}</span>
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[#FCA311]"
                  checked={state.confirmed}
                  disabled={locked}
                  onChange={(e) => update(item.key, { confirmed: e.target.checked })}
                />
              </label>
              {item.help && item.type !== "confirm_only" ? (
                <p className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-[#14213D]/60">{item.help}</p>
              ) : null}
              <div className="mt-1 space-y-1">
                {item.key === "address_complete" ? (
                  <textarea
                    disabled={locked}
                    rows={Math.min(4, Math.max(1, Math.ceil(state.value.trim().length / 36) || 1))}
                    dir={/[\u0600-\u06FF]/.test(state.value) ? "rtl" : "ltr"}
                    value={state.value}
                    onChange={(e) => update(item.key, { value: e.target.value })}
                    className={`${inputCls} resize-none leading-5`}
                  />
                ) : item.type === "confirm_text" ? (
                  <>
                    <div className="flex items-center gap-1">
                      <input
                        disabled={locked}
                        value={state.value}
                        onChange={(e) => update(item.key, { value: e.target.value })}
                        className={`${inputCls} flex-1`}
                      />
                      {item.key === "primary_phone" && !locked ? (
                        <button
                          type="button"
                          aria-label={extraPhoneOpen ? "إزالة التليفون الإضافي" : "إضافة تليفون آخر"}
                          onClick={() => {
                            if (extraPhoneOpen) {
                              setExtraPhoneOpen(false);
                              setExtraPhone("");
                            } else {
                              setExtraPhoneOpen(true);
                            }
                          }}
                          className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#14213D] text-sm font-extrabold text-white"
                        >
                          {extraPhoneOpen ? "−" : "+"}
                        </button>
                      ) : null}
                    </div>
                    {item.key === "primary_phone" && extraPhoneOpen ? (
                      <input
                        disabled={locked}
                        dir="ltr"
                        value={extraPhone}
                        onChange={(e) => setExtraPhone(e.target.value)}
                        placeholder="تليفون آخر"
                        className={inputCls}
                      />
                    ) : null}
                  </>
                ) : null}
                {item.type === "choice" ? (
                  <select
                    disabled={locked}
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
                ) : null}
                {item.type === "yes_no_extra" ? (
                  <>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => update(item.key, { yesNo: "yes", confirmed: false })}
                        className={`flex-1 rounded-lg py-1 text-xs font-extrabold disabled:opacity-70 ${
                          state.yesNo === "yes" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
                        }`}
                      >
                        نعم
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => update(item.key, { yesNo: "no", confirmed: true, note: "" })}
                        className={`flex-1 rounded-lg py-1 text-xs font-extrabold disabled:opacity-70 ${
                          state.yesNo === "no" ? "bg-black text-white" : "bg-[#E5E5E5] text-[#14213D]"
                        }`}
                      >
                        لا
                      </button>
                    </div>
                    {state.yesNo === "yes" ? (
                      <input
                        disabled={locked}
                        value={state.note}
                        onChange={(e) => update(item.key, { note: e.target.value })}
                        placeholder="بديل"
                        className={inputCls}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          );
        });
  }

  function discountCard(locked: boolean) {
    const canSendDiscount =
      !locked &&
      !requestingDiscountApproval &&
      discountApprovalStatus !== "pending" &&
      Boolean(discountAmount.trim()) &&
      Number(discountAmount.replace(/,/g, "")) > 0;

    async function sendDiscountApproval() {
      setRequestingDiscountApproval(true);
      setMessage("");
      const res = await fetch(`/api/cs/confirmations/${confirmationId}/discount-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountAmount: discountAmount.trim() }),
      });
      const data = (await res.json()) as { message?: string };
      setRequestingDiscountApproval(false);
      if (!res.ok) {
        setMessage(data.message || "تعذر إرسال طلب الخصم.");
        return;
      }
      setDiscountApprovalStatus("pending");
      setMessage("تم إرسال طلب الخصم للأدمن.");
    }

    async function cancelPendingDiscount() {
      setRequestingDiscountApproval(true);
      setMessage("");
      const res = await fetch(`/api/cs/confirmations/${confirmationId}/discount-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = (await res.json()) as { message?: string };
      setRequestingDiscountApproval(false);
      if (!res.ok) {
        setMessage(data.message || "تعذر إلغاء طلب الخصم.");
        return;
      }
      setDiscountApprovalStatus("none");
      setDiscountAmount("");
      setMessage("اتلغى طلب الخصم. تقدر تحفظ من غير خصم.");
    }

    return (
      <div className="flex h-full flex-col justify-between rounded-xl bg-[#FCA311]/15 p-1.5 shadow-sm ring-2 ring-inset ring-[#FCA311]">
        <div>
          <p className="text-xs font-extrabold text-[#14213D]">خصم</p>
          <p className="mt-0.5 text-[10px] font-bold text-[#14213D]/60">اختياري — بموافقة الأدمن</p>
          <input
            disabled={locked}
            dir="ltr"
            inputMode="decimal"
            value={discountAmount}
            onChange={(e) => {
              setDiscountAmount(e.target.value.replace(/[^\d.]/g, ""));
              if (discountApprovalStatus === "approved" || discountApprovalStatus === "rejected") {
                setDiscountApprovalStatus("none");
              }
            }}
            placeholder="قيمة الخصم"
            className={`${inputCls} mt-1`}
          />
          <p className="mt-1 text-[10px] font-bold text-[#14213D]/70">
            بعد الخصم: {Number.isFinite(adjustedTotal) ? adjustedTotal : "—"} ج.م
          </p>
          <div className="mt-1 rounded-lg bg-white/70 px-2 py-1 text-[10px] font-bold text-[#14213D]">
            {discountApprovalStatus === "pending"
              ? "بانتظار موافقة الأدمن"
              : discountApprovalStatus === "approved"
                ? "معتمد"
                : discountApprovalStatus === "rejected"
                  ? "مرفوض"
                  : "لم يُطلب موافقة بعد"}
          </div>
        </div>
        <div className="mt-2 grid gap-1">
          <button
            type="button"
            disabled={!canSendDiscount}
            onClick={() => void sendDiscountApproval()}
            className="w-full rounded-lg bg-[#FCA311] px-2 py-1.5 text-[11px] font-extrabold text-black disabled:opacity-50"
          >
            {requestingDiscountApproval
              ? "جاري التحميل"
              : discountApprovalStatus === "pending"
                ? "بانتظار الرد…"
                : "طلب موافقه"}
          </button>
          {discountApprovalStatus === "pending" ? (
            <button
              type="button"
              disabled={locked || requestingDiscountApproval}
              onClick={() => void cancelPendingDiscount()}
              className="w-full rounded-lg bg-white px-2 py-1 text-[10px] font-extrabold text-[#14213D] ring-1 ring-[#14213D]/20 disabled:opacity-50"
            >
              إلغاء طلب الخصم
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function depositCard() {
    return (
      <div className="flex h-full flex-col justify-between rounded-xl bg-[#0D9488]/15 p-1.5 shadow-sm ring-2 ring-inset ring-[#0D9488]">
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs font-extrabold text-[#14213D]">طلب ديبوزت</p>
          <button
            type="button"
            onClick={() => setDepositOpen(true)}
            aria-label="تكبير كارت الديبوزت"
            className="grid size-6 place-items-center rounded-md bg-[#0D9488] text-sm font-extrabold text-white"
          >
            ↗
          </button>
        </div>
        <p className={`mt-1 text-[11px] font-extrabold ${depositPayLabel ? "text-[#0D9488]" : "text-[#14213D]/50"}`}>
          {depositPayLabel || "اختياري"}
        </p>
      </div>
    );
  }

  function bostaShipmentCard() {
    return (
      <div className="flex flex-col rounded-xl bg-[#14213D] p-1.5 text-white shadow-sm ring-2 ring-inset ring-[#FCA311]">
        <p className="text-xs font-extrabold text-[#FCA311]">شحنة بوسطة</p>
        <input
          dir="ltr"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="رقم التراك"
          className={`mt-1 ${inputCls} text-[#14213D]`}
        />
        <p
          className="mt-1 text-[10px] font-bold leading-4"
          title={bostaSyncedAt ? `آخر تحديث ${new Date(bostaSyncedAt).toLocaleString("ar-EG")}` : undefined}
        >
          {bostaStatus ? getBostaStatusLabelAr(bostaStatus) : "لسه مفيش بوليصة"}
          {" · "}
          شحن {bostaFee == null ? "—" : `${bostaFee.toLocaleString("ar-EG")}`}
          {" · "}
          تحصيل {bostaCod == null ? "—" : `${bostaCod.toLocaleString("ar-EG")}`}
          {bostaLastEvent ? ` · ${bostaLastEvent}` : ""}
        </p>
        {bostaError ? <p className="mt-1 text-[10px] font-bold text-[#FCA311]">{bostaError}</p> : null}
      </div>
    );
  }

  function depositFields(locked: boolean) {
    if (!depositOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/40 p-4">
        <div className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-hidden rounded-2xl bg-[#F4FFFC] p-3 shadow-lg ring-2 ring-[#0D9488]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-[#14213D]">طلب ديبوزت</p>
            <button
              type="button"
              onClick={() => setDepositOpen(false)}
              aria-label="تصغير كارت الديبوزت"
              className="grid size-8 place-items-center rounded-md bg-[#14213D] text-sm font-extrabold text-white"
            >
              ↙
            </button>
          </div>
          <p className="mt-1 text-xs text-[#14213D]/60">
            اختياري. لو اتسجلت قيمة، الحفظ النهائي بعد موافقة الأدمن.
            {depositPayLabel ? ` · ${depositPayLabel}` : ""}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold text-[#14213D]/70">الدفع من</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              <button
                type="button"
                disabled={locked}
                onClick={() => setDepositPayMethod("wallet")}
                className={`${compactBtn} disabled:opacity-70 ${
                  depositPayMethod === "wallet" ? "bg-[#0D9488] text-white" : "bg-white text-[#14213D]"
                }`}
              >
                محفظة
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => setDepositPayMethod("instapay")}
                className={`${compactBtn} disabled:opacity-70 ${
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
              disabled={locked}
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
                disabled={locked}
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
              disabled={locked}
              value={depositToKey}
              onChange={(e) => setDepositToKey(e.target.value)}
              className={inputCls}
              dir="ltr"
            >
              <option value="">اختر...</option>
              {DEPOSIT_TO_OPTIONS.map((opt) => (
                <option key={makeDepositToKey(opt.phone, opt.method)} value={makeDepositToKey(opt.phone, opt.method)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[#14213D]/70">قيمة المقدم</label>
            <input
              dir="ltr"
              disabled={locked}
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
              disabled={locked}
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
                disabled={locked}
                inputMode="numeric"
                value={depositPaidHour}
                onChange={(e) => setDepositPaidHour(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                placeholder="ساعة"
                className={inputCls}
              />
              <span className="text-xs font-extrabold text-[#14213D]">:</span>
              <input
                dir="ltr"
                disabled={locked}
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
                disabled={locked}
                onClick={() => setDepositPaidPeriod("morning")}
                className={`${compactBtn} flex-1 disabled:opacity-70 ${
                  depositPaidPeriod === "morning" ? "bg-[#0D9488] text-white" : "bg-white text-[#14213D]"
                }`}
              >
                صباحاً
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => setDepositPaidPeriod("evening")}
                className={`${compactBtn} flex-1 disabled:opacity-70 ${
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
            disabled={locked || requestingApproval || depositApprovalStatus === "pending"}
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
            className="w-full rounded-lg bg-[#0D9488] px-2 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-3"
          >
            {requestingApproval ? "جاري التحميل" : depositApprovalStatus === "pending" ? "بانتظار الرد…" : "طلب موافقه"}
          </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3" dir="rtl">
      {maintenanceTechNote ? (
        <div className="rounded-2xl bg-[#FFF8E7] px-3 py-2 text-sm font-bold text-[#14213D] ring-1 ring-[#FCA311]/40">
          <span className="font-extrabold">ملاحظة فني الصيانة: </span>
          {maintenanceTechNote}
        </div>
      ) : null}
      {sheetDayPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 text-[#14213D] shadow-lg">
            <p className="text-sm font-extrabold leading-6">{sheetDayPrompt.message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void save(sheetDayPrompt.finalize, sheetDayPrompt.failContact, sheetDayPrompt.cancelOrder, "previous")
                }
                className="rounded-xl bg-[#14213D] px-3 py-2 text-xs font-extrabold text-white disabled:opacity-60"
              >
                التعديل في اليوم السابق
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void save(sheetDayPrompt.finalize, sheetDayPrompt.failContact, sheetDayPrompt.cancelOrder, "today")
                }
                className="rounded-xl bg-[#FCA311] px-3 py-2 text-xs font-extrabold text-black disabled:opacity-60"
              >
                إظهاره في اليوم الحالي
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setSheetDayPrompt(null)}
                className="rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-[#14213D] ring-1 ring-[#E5E5E5] disabled:opacity-60"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link href="/cs" className="text-sm font-bold text-[#14213D] underline">
            رجوع
          </Link>
          <h1 className="truncate text-xl font-extrabold text-[#14213D]">طلب #{snapshot?.number || confirmationId}</h1>
          <p className="text-xs font-bold text-[#14213D]/60">
            {when.absolute} · {when.relative}
          </p>
          {lockedShipping === "bosta" && !showFollowUp ? (
            <p className="text-xs font-bold text-[#14213D]/70">
              بوسطة: احفظ أولًا عشان العنوان والتفاصيل تنزل على بوسطة، وبعدين اطبع البوليصة.
            </p>
          ) : null}
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
                {saving ? "جاري التحميل" : "مسودة"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                className="rounded-xl bg-[#FCA311] px-3 py-2 text-sm font-extrabold text-black disabled:opacity-60"
              >
                {saving ? "جاري التحميل" : "حفظ نهائي"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true, true)}
                className="rounded-xl bg-black px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {saving ? "جاري التحميل" : "لم يرد"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true, false, true)}
                className="rounded-xl bg-red-700 px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {saving ? "جاري التحميل" : "لاغى"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(false)}
              className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {saving ? "جاري التحميل" : "حفظ المتابعة"}
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
          {depositPayLabel ? (
            <span className="rounded bg-[#0D9488] px-2 py-0.5 font-extrabold text-white">{depositPayLabel}</span>
          ) : null}
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
        <div className="mt-1 grid gap-1 text-xs text-white/90 sm:grid-cols-3">
          <span className="truncate">الشارع: {answers.address_complete?.value || snapshot?.address || "—"}</span>
          <span className="truncate">المحافظة: {answers.governorate_confirm?.value || snapshot?.governorate || "—"}</span>
          <span className="truncate">المنطقة: {answers.area_confirm?.value || snapshot?.area || "—"}</span>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-white/80">
          {(snapshot?.items || []).map((i) => `${i.quantity}×${i.name}`).join(" · ")}
        </p>
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

      <div className="grid items-stretch gap-3 lg:grid-cols-2">
        <div className="order-1 flex h-full min-h-0 flex-col gap-2 p-1 lg:order-2">
      {!showFollowUp ? (
        <div className="grid min-h-0 flex-1 content-stretch gap-2 sm:grid-cols-2 lg:auto-rows-fr lg:grid-cols-3">
          {infoCards(false)}
          {discountCard(false)}
          {lockedShipping === "bosta" ? bostaShipmentCard() : null}
        </div>
      ) : (
        <div className="grid content-start gap-2 sm:grid-cols-2">
          {showCancelCard ? (
            <div className="flex flex-col justify-between rounded-2xl bg-red-50 p-3 shadow ring-2 ring-red-700">
              <div>
                <p className="text-sm font-extrabold text-red-800">إلغاء بعد التأكيد</p>
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
          <label className="flex cursor-pointer flex-col justify-between rounded-2xl bg-white p-3 shadow ring-2 ring-[#E5E5E5]">
            <span className="text-sm font-extrabold text-[#14213D]">تم التسليم لشركة الشحن</span>
            <input
              type="checkbox"
              className="mt-4 size-6 accent-[#FCA311]"
              checked={fu.handedToCarrier}
              onChange={(e) => setFu((p) => ({ ...p, handedToCarrier: e.target.checked }))}
            />
          </label>
          <label className="flex cursor-pointer flex-col justify-between rounded-2xl bg-white p-3 shadow ring-2 ring-[#E5E5E5]">
            <span className="text-sm font-extrabold text-[#14213D]">تم التسليم للعميل</span>
            <p className="mt-1 text-sm text-[#14213D]/60">من التتبع أو تأكيد الاستلام</p>
            <input
              type="checkbox"
              className="mt-4 size-6 accent-[#FCA311]"
              checked={fu.deliveredToCustomer}
              onChange={(e) => setFu((p) => ({ ...p, deliveredToCustomer: e.target.checked }))}
            />
          </label>
          <label className="flex cursor-pointer flex-col justify-between rounded-2xl bg-white p-3 shadow ring-2 ring-[#E5E5E5]">
            <span className="text-sm font-extrabold text-[#14213D]">متابعة العميل</span>
            <input
              type="checkbox"
              className="mt-4 size-6 accent-[#FCA311]"
              checked={fu.customerFollowUp}
              onChange={(e) => setFu((p) => ({ ...p, customerFollowUp: e.target.checked }))}
            />
          </label>
        </div>
      )}

      {fulfillmentCard()}

      {/* Bottom row: shipping + deposit + tracking + waybill */}
      <div className="grid shrink-0 grid-cols-1 items-stretch gap-2 sm:grid-cols-3">
        {!showFollowUp ? depositCard() : null}

        <div
          className={`flex h-full flex-col rounded-xl p-1.5 shadow-sm ring-2 ring-inset ${
            missing.includes("shipping_company")
              ? "ring-red-500 bg-white"
              : "ring-[#FCA311] bg-[#FCA311]/20"
          }`}
        >
          <p className="text-xs font-extrabold text-[#14213D]">شركة الشحن</p>
          <p className="mt-1 text-[11px] font-extrabold text-[#14213D]">
            {lockedShipping ? SHIPPING_COMPANY_LABEL[lockedShipping] : "لم تُحدد بعد"}
          </p>
        </div>

        {showFollowUp && lockedShipping === "bosta" ? bostaShipmentCard() : null}

        <div className="flex h-full flex-col rounded-xl bg-[#059669]/15 p-1.5 shadow-sm ring-2 ring-inset ring-[#059669]">
          <p className="text-xs font-extrabold text-[#14213D]">طباعة البوليصة</p>
        <button
          type="button"
          disabled={printingWaybill || creatingWaybill}
          onClick={() => void printWaybill()}
          className={`mt-1 rounded-lg px-2 py-1 text-xs font-extrabold ring-1 ring-[#059669] ${
            waybillPrinted ? "bg-[#059669] text-white" : "bg-white text-[#14213D]"
          }`}
        >
          {printingWaybill || creatingWaybill
            ? "جاري التحميل"
            : waybillPrinted
              ? "مطبوع"
              : "طباعة البوليصة"}
        </button>
        </div>
      </div>
      </div>

      {waybillCreatePrompt ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-[#14213D]/15">
            <p className="text-base font-extrabold text-[#14213D]">مفيش بوليصة على بوسطة</p>
            <p className="mt-2 text-sm font-bold text-[#14213D]/80">
              هذا الأوردر لا توجد له بوليصة على بوسطة. هل تريد عمل بوليصة؟
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={creatingWaybill || printingWaybill}
                onClick={() => void createWaybillAndPrint()}
                className="flex-1 rounded-xl bg-[#FCA311] px-4 py-2.5 text-sm font-extrabold text-black disabled:opacity-60"
              >
                {creatingWaybill ? "جاري الإنشاء…" : "نعم اعمل بوليصة"}
              </button>
              <button
                type="button"
                disabled={creatingWaybill || printingWaybill}
                onClick={() => setWaybillCreatePrompt(false)}
                className="flex-1 rounded-xl bg-[#14213D] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                لا
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <section className="order-2 flex h-full flex-col gap-3 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/15 lg:order-1">
        <div className="grid gap-2 border-b border-[#14213D]/10 pb-3">
          <input
            value={itemQuery}
            onChange={(event) => setItemQuery(event.target.value)}
            placeholder="ابحث باسم الصنف أو رقم الموديل"
            className={inputCls}
          />
          {itemHits.length ? (
            <div className="grid max-h-48 gap-1 overflow-auto">
              {itemHits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  disabled={itemBusy}
                  onClick={() =>
                    void requestItem({
                      kind: "add",
                      wooProductId: hit.id,
                      productName: hit.name,
                      quantity: Math.max(1, Number(itemQty) || 1),
                      unitPrice: Number(String(hit.price).replace(/[^\d.]/g, "")) || 0,
                    })
                  }
                  className="rounded-lg bg-[#F5F5F0] px-2 py-1.5 text-right text-sm font-bold text-[#14213D]"
                >
                  {hit.name}
                  {hit.displayCode ? ` · ${hit.displayCode}` : ""} · {hit.price}
                </button>
              ))}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-xs font-bold text-[#14213D]">
            الكمية
            <input
              value={itemQty}
              onChange={(event) => setItemQty(event.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              className="h-7 w-16 rounded border border-[#E5E5E5] px-2 text-xs"
            />
          </label>
        </div>
        <div className="max-h-72 overflow-auto">
          <table className="w-full border-collapse text-right text-sm text-[#14213D]">
            <thead className="sticky top-0 z-10 bg-[#F8F4EA] text-xs font-extrabold">
              <tr>
                {["الصنف", "الكمية", "السعر", "القيمة", ""].map((head) => (
                  <th key={head || "act"} className="border-b border-[#14213D]/10 px-2 py-1">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(snapshot?.items || []).map((item, index) => {
                const quantity = Number(item.quantity || 1);
                const line = Number(String(item.total || "0").replace(/[^\d.]/g, "")) || 0;
                const price = quantity ? line / quantity : line;
                return (
                  <tr key={`${item.name}-${index}`} className="border-b border-[#14213D]/10">
                    <td className="px-2 py-1">{item.name}</td>
                    <td className="px-2 py-1">{quantity}</td>
                    <td className="px-2 py-1">{price.toLocaleString("ar-EG")}</td>
                    <td className="px-2 py-1 font-extrabold">{line.toLocaleString("ar-EG")}</td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        disabled={itemBusy}
                        onClick={() =>
                          void requestItem({
                            kind: "remove",
                            wooProductId: 0,
                            productName: item.name,
                            quantity,
                            unitPrice: price,
                          })
                        }
                        className="rounded bg-red-700 px-1.5 py-0.5 text-[10px] font-extrabold text-white disabled:opacity-50"
                      >
                        إلغاء
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pendingAdds
                .filter((row) => row.status === "pending")
                .map((row) => (
                  <tr key={`pending-${row.id}`} className="border-b border-amber-200 bg-amber-50">
                    <td className="px-2 py-1">
                      {row.kind === "remove" ? "إلغاء: " : "إضافة: "}
                      {row.productName}
                      <span className="mr-1 text-[10px] font-bold text-amber-800">مسودة</span>
                    </td>
                    <td className="px-2 py-1">{row.quantity}</td>
                    <td className="px-2 py-1">{row.unitPrice.toLocaleString("ar-EG")}</td>
                    <td className="px-2 py-1">{row.lineTotal.toLocaleString("ar-EG")}</td>
                    <td className="px-2 py-1">
                      {canApproveItems ? (
                        <span className="flex gap-1">
                          <button
                            type="button"
                            disabled={itemBusy}
                            onClick={() => void decideItem(row.id, "approved")}
                            className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
                          >
                            موافقة
                          </button>
                          <button
                            type="button"
                            disabled={itemBusy}
                            onClick={() => void decideItem(row.id, "rejected")}
                            className="rounded bg-[#14213D] px-1.5 py-0.5 text-[10px] font-extrabold text-white"
                          >
                            رفض
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="min-h-24 shrink-0" />
        <div className="grid shrink-0 gap-1 rounded-xl bg-[#F8F4EA] p-3 text-sm font-extrabold text-[#14213D]">
          <p className="flex justify-between gap-2">
            <span>عدد القطع</span>
            <span>
              {(snapshot?.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0).toLocaleString("ar-EG")}
            </span>
          </p>
          <p className="flex justify-between gap-2">
            <span>إجمالي الأصناف</span>
            <span>
              {(snapshot?.items || [])
                .reduce((sum, item) => sum + (Number(String(item.total || "0").replace(/[^\d.]/g, "")) || 0), 0)
                .toLocaleString("ar-EG")}{" "}
              ج.م
            </span>
          </p>
          <p className="flex justify-between gap-2">
            <span>قيمة الأوردر</span>
            <span>
              {snapshot?.total} {snapshot?.currency || "EGP"}
            </span>
          </p>
        </div>
      </section>
      </div>
      {lockedShipping === "bosta" ? (
        <BostaTrackLine
          status={bostaStatus}
          events={bostaEvents}
          trackingNumber={trackingNumber}
          hideEvents={Boolean(bostaError)}
        />
      ) : null}
      {depositFields(false)}
      {showFollowUp ? (
        <section className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {infoCards(lockRecorded)}
          {discountCard(false)}
          {depositCard()}
        </section>
      ) : null}
    </div>
  );
}