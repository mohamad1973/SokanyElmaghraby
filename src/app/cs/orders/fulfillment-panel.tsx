"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import { SHIPPING_COMPANY_LABEL, type CsChecklistAnswerInput } from "@/lib/cs/checklist";
import { usesSokanyWaybillPrint } from "@/lib/cs/sokany-waybill-types";

export type FulfillmentSnapshot = {
  customerName?: string;
  phone?: string;
  address?: string;
  governorate?: string;
  area?: string;
  total?: string;
  number?: string;
  items?: Array<{ name: string; quantity: number; total?: string; sku?: string }>;
  fulfillmentKind?: string;
  parentConfirmationId?: number;
  trackingNumber?: string | null;
};

type FulfillmentChild = {
  id: number;
  wooOrderNumber: string;
  kind: "return" | "exchange";
  trackingNumber: string | null;
  shippingCompany: string | null;
};

type MonaCourierOpt = { id: number; name: string; bucket: "eid" | "momen" | null };

export type FulfillmentPanelParts = "all" | "card" | "waybill";

const inputCls = "w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-xs font-bold text-[#14213D]";
const compactBtn = "rounded-lg px-2.5 py-1 text-[11px] font-extrabold";

export function CsFulfillmentPanel({
  confirmationId,
  snapshot,
  shippingCompany,
  sokanyWaybill = false,
  confirmed,
  trackingNumber: initialTracking,
  waybillPrinted: initialWaybillPrinted,
  answers = [],
  shippingMissing = false,
  leadingSlot = null,
  trailingSlot = null,
  showSummary = false,
  parts = "all",
  onMessage,
  onTrackingChange,
  onWaybillPrinted,
}: {
  confirmationId: number;
  snapshot: FulfillmentSnapshot | null;
  shippingCompany?: string | null;
  sokanyWaybill?: boolean;
  confirmed: boolean;
  trackingNumber?: string | null;
  waybillPrinted?: boolean;
  answers?: CsChecklistAnswerInput[];
  shippingMissing?: boolean;
  leadingSlot?: ReactNode;
  trailingSlot?: ReactNode;
  showSummary?: boolean;
  parts?: FulfillmentPanelParts;
  onMessage?: (message: string) => void;
  onTrackingChange?: (tracking: string) => void;
  onWaybillPrinted?: () => void;
}) {
  const showCard = parts === "all" || parts === "card";
  const showWaybill = parts === "all" || parts === "waybill";
  const lockedShipping = String(shippingCompany || "").trim() || null;
  const printSokanyAwb = usesSokanyWaybillPrint(lockedShipping, sokanyWaybill);
  const [trackingNumber, setTrackingNumber] = useState(String(initialTracking || snapshot?.trackingNumber || "").trim());
  const [waybillPrinted, setWaybillPrinted] = useState(Boolean(initialWaybillPrinted));
  const [printingWaybill, setPrintingWaybill] = useState(false);
  const [waybillCreatePrompt, setWaybillCreatePrompt] = useState(false);
  const [creatingWaybill, setCreatingWaybill] = useState(false);
  const [message, setMessage] = useState("");

  const isFulfillmentChild = Boolean(
    snapshot && (snapshot.parentConfirmationId || snapshot.fulfillmentKind === "return" || snapshot.fulfillmentKind === "exchange"),
  );
  const canCreateFulfillment =
    !isFulfillmentChild &&
    confirmed &&
    (lockedShipping === "sayed_temima" ||
      lockedShipping === "eid" ||
      lockedShipping === "momen" ||
      Boolean(shippingCompany === "eid" || shippingCompany === "momen" || shippingCompany === "sayed_temima"));

  const [fulfillmentKind, setFulfillmentKind] = useState<"return" | "exchange">("exchange");
  const [fulfillmentDesk, setFulfillmentDesk] = useState<"sayed_temima" | "eid" | "momen" | "bosta">(
    lockedShipping === "eid" || lockedShipping === "momen" || lockedShipping === "sayed_temima" || lockedShipping === "bosta"
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
    setTrackingNumber(String(initialTracking || snapshot?.trackingNumber || "").trim());
  }, [confirmationId, initialTracking, snapshot?.trackingNumber]);

  useEffect(() => {
    setWaybillPrinted(Boolean(initialWaybillPrinted));
  }, [confirmationId, initialWaybillPrinted]);

  function tell(text: string) {
    setMessage(text);
    onMessage?.(text);
  }

  useEffect(() => {
    if (!showCard || !confirmationId) return;
    if (parts !== "card" && !canCreateFulfillment) return;
    void fetch(`/api/cs/confirmations/${confirmationId}/fulfillment`)
      .then((res) => res.json())
      .then((data: { items?: FulfillmentChild[]; couriers?: MonaCourierOpt[] }) => {
        setFulfillmentChildren(data.items || []);
        setMonaCouriers(data.couriers || []);
      })
      .catch(() => undefined);
  }, [canCreateFulfillment, confirmationId, parts, showCard]);

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

  function printFulfillmentWaybill(childId: number) {
    const popup = window.open(`/cs/print/sokany-awb/${childId}`, "sokany-awb");
    if (!popup) {
      tell("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعيدي المحاولة.");
      return;
    }
    tell("اتفتحت بوليصة سوكانى للطباعة 10×15.");
  }

  async function submitFulfillment() {
    if (!confirmationId) {
      tell("اختَر الأوردر من اليمين.");
      return;
    }
    setFulfillmentBusy(true);
    tell("");
    const answer = (key: string) => answers.find((row) => row.itemKey === key)?.value || "";
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
        phone: snapshot?.phone || answer("primary_phone"),
        address: snapshot?.address || answer("address_complete"),
        governorate: snapshot?.governorate || answer("governorate_confirm"),
        area: snapshot?.area || answer("area_confirm"),
        customerName: snapshot?.customerName || answer("customer_name"),
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
      tell(
        data?.message ||
          (!data?.trackingNumber && data?.confirmationId
            ? fulfillmentDesk === "bosta"
              ? "تم حفظ الأوردر لكن تعذر إنشاء بوليصة بوسطة — لا يمكن الطباعة."
              : "تم حفظ الأوردر لكن تعذر إنشاء بوليصة سوكانى — لا يمكن الطباعة."
            : "تعذر إنشاء الاستبدال/الاسترجاع."),
      );
      return;
    }
    const billName = fulfillmentDesk === "bosta" ? "بوسطة" : "سوكانى";
    tell(`تم إنشاء ${fulfillmentKind === "exchange" ? "استبدال" : "استرجاع"} #${data.wooOrderNumber} وبوليصة ${billName}.`);
    if (fulfillmentDesk === "bosta") {
      await printWaybillPdf(data.trackingNumber || "ok", data.confirmationId);
    } else {
      printFulfillmentWaybill(data.confirmationId);
    }
  }

  async function printWaybillPdf(currentTracking: string, targetId = confirmationId) {
    if (!currentTracking.trim()) {
      setWaybillCreatePrompt(true);
      return;
    }
    const preview = window.open("", "bosta-awb");
    setPrintingWaybill(true);
    tell("");
    const res = await fetch(`/api/cs/confirmations/${targetId}/bosta-awb`);
    if (!res.ok) {
      preview?.close();
      const data = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
      setPrintingWaybill(false);
      if (data?.code === "missing_waybill" || /مفيش بوليصة|غير موجود|not found|404/i.test(data?.message || "")) {
        if (targetId === confirmationId) {
          setWaybillCreatePrompt(true);
          tell("");
        } else {
          tell(data?.message || "تعذر طباعة بوليصة بوسطة.");
        }
        return;
      }
      tell(data?.message || "تعذر طباعة بوليصة بوسطة.");
      return;
    }
    const blob = await res.blob();
    const signature = new TextDecoder().decode(await blob.slice(0, 4).arrayBuffer());
    if (signature !== "%PDF") {
      preview?.close();
      setPrintingWaybill(false);
      tell("بوسطة أنشأت البوليصة من غير ملف للطباعة.");
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
      onWaybillPrinted?.();
      tell("البوليصة اتطبعت. تقدر تحفظ الأوردر.");
      void fetch(`/api/cs/confirmations/${targetId}/bosta-awb`, { method: "POST" });
    };
    const printWhenReady = (target: Window, frame?: HTMLIFrameElement, alreadyLoaded = false) => {
      let started = false;
      const arm = () => {
        if (started || target.closed) return;
        started = true;
        window.setTimeout(() => {
          if (target.closed) {
            setPrintingWaybill(false);
            tell("اتقفلت نافذة الطباعة قبل ما البوليصة تطبع.");
            URL.revokeObjectURL(url);
            return;
          }
          target.focus();
          try {
            target.print();
          } catch {
            setPrintingWaybill(false);
            tell("تعذر فتح نافذة الطباعة.");
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
        tell("تعذر فتح نافذة الطباعة.");
        frame.remove();
        URL.revokeObjectURL(url);
        return;
      }
      printWhenReady(win, frame, true);
    };
    document.body.appendChild(frame);
    frame.src = url;
  }

  async function openSokanyAwb() {
    const res = await fetch(`/api/cs/confirmations/${confirmationId}/sokany-awb`);
    const data = (await res.json().catch(() => ({}))) as { message?: string; tracking?: string; printUrl?: string };
    if (!res.ok) {
      tell(data.message || "تعذر إنشاء بوليصة سوكانى.");
      return;
    }
    if (data.tracking) {
      setTrackingNumber(data.tracking);
      onTrackingChange?.(data.tracking);
    }
    const popup = window.open(data.printUrl || `/cs/print/sokany-awb/${confirmationId}`, "sokany-awb");
    if (!popup) {
      tell("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعيدي المحاولة.");
      return;
    }
    setWaybillPrinted(true);
    onWaybillPrinted?.();
    setWaybillCreatePrompt(false);
    tell("اتفتحت بوليصة سوكانى للطباعة 10×15.");
  }

  async function printWaybill() {
    if (printSokanyAwb) {
      await openSokanyAwb();
      return;
    }
    await printWaybillPdf(trackingNumber);
  }

  async function createWaybillAndPrint() {
    if (creatingWaybill || printingWaybill) return;
    if (printSokanyAwb) {
      await openSokanyAwb();
      return;
    }
    setCreatingWaybill(true);
    tell("");
    const res = await fetch(`/api/cs/confirmations/${confirmationId}/bosta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", answers }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      trackingNumber?: string | null;
      bostaSyncError?: string | null;
    };
    setCreatingWaybill(false);
    if (!res.ok || !data.trackingNumber) {
      tell(data.message || data.bostaSyncError || "تعذر إنشاء بوليصة بوسطة.");
      return;
    }
    setTrackingNumber(data.trackingNumber);
    onTrackingChange?.(data.trackingNumber);
    setWaybillCreatePrompt(false);
    tell(data.message || "تم إنشاء البوليصة وربطها بالأوردر.");
    await printWaybillPdf(data.trackingNumber);
  }

  const deskCouriers = monaCouriers.filter((row) => row.bucket === fulfillmentDesk);
  const originalItems = snapshot?.items || [];

  return (
    <div className="space-y-2" dir="rtl">
      {showSummary ? (
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-[#14213D]/10">
          <p className="text-sm font-extrabold text-[#14213D]">#{snapshot?.number || confirmationId}</p>
          <p className="text-xs font-bold text-[#14213D]/70">
            {snapshot?.customerName || "—"} · <span dir="ltr">{snapshot?.phone || "—"}</span>
          </p>
          {snapshot?.total ? <p className="text-xs font-bold">{snapshot.total} ج.م</p> : null}
          {originalItems.map((item, index) => (
            <p key={`${item.name}-${index}`} className="text-[11px] font-bold text-[#14213D]/80">
              {item.name} × {item.quantity}
            </p>
          ))}
        </div>
      ) : null}
      {message && (showSummary || showCard) ? (
        <p className="rounded-xl bg-[#14213D] px-3 py-2 text-xs font-bold text-white">{message}</p>
      ) : null}

      {showCard && (parts === "card" || canCreateFulfillment) ? (
        <div className="rounded-2xl bg-[#FFF8E7] p-3 shadow-sm ring-2 ring-inset ring-[#FCA311]">
          <p className="text-sm font-extrabold text-[#14213D]">استبدال / استرجاع</p>
          <p className="mt-0.5 text-[11px] font-bold text-[#14213D]/70">
            لا يغيّر الأوردر الأصلي — سيد/عيد/مؤمن يطبعوا بوليصة سوكانى، وبوسطة تطبع بوليصة بوسطة. رسوم الشحن عند تم بنجاح.
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
                  ["bosta", "بوسطة"],
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
                ? "الاسترجاع ينقص حساب المندوب لأنه يدفع للعميل. بوليصة سوكانى نوع استرجاع، والوصف فيه اسم المنتج الراجع، وقيمة المرتجع تظهر على البوليصة."
                : "موجب = مبلغ التحصيل على بوليصة استبدال سوكانى · سالب = رد فرق ينقص الحساب · الوصف: منتج خارج + منتج راجع"}
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
            {snapshot?.phone || answers.find((row) => row.itemKey === "primary_phone")?.value || "—"} ·{" "}
            {snapshot?.customerName || answers.find((row) => row.itemKey === "customer_name")?.value || "—"}
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
                    onClick={() => {
                      if (child.shippingCompany === "bosta") {
                        void printWaybillPdf(child.trackingNumber || "ok", child.id);
                      } else {
                        printFulfillmentWaybill(child.id);
                      }
                    }}
                  >
                    {child.trackingNumber ? "طباعة" : "بدون بوليصة"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {showWaybill ? (
      <div className="grid shrink-0 grid-cols-1 items-stretch gap-2 sm:grid-cols-3">
        {leadingSlot}

        <div
          className={`flex h-full flex-col rounded-xl p-1.5 shadow-sm ring-2 ring-inset ${
            shippingMissing ? "ring-red-500 bg-white" : "ring-[#FCA311] bg-[#FCA311]/20"
          }`}
        >
          <p className="text-xs font-extrabold text-[#14213D]">شركة الشحن</p>
          <p className="mt-1 text-[11px] font-extrabold text-[#14213D]">
            {lockedShipping ? SHIPPING_COMPANY_LABEL[lockedShipping] || lockedShipping : "لم تُحدد بعد"}
          </p>
        </div>

        {trailingSlot}

        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (printingWaybill || creatingWaybill) return;
            void printWaybill();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (printingWaybill || creatingWaybill) return;
              void printWaybill();
            }
          }}
          className="flex h-full cursor-pointer flex-col rounded-xl bg-[#059669]/15 p-1.5 shadow-sm ring-2 ring-inset ring-[#059669]"
        >
          <p className="text-xs font-extrabold text-[#14213D]">طباعة البوليصة</p>
          <button
            type="button"
            disabled={printingWaybill || creatingWaybill}
            className={`pointer-events-none mt-1 rounded-lg px-2 py-1 text-xs font-extrabold ring-1 ring-[#059669] ${
              waybillPrinted ? "bg-[#059669] text-white" : "bg-white text-[#14213D]"
            }`}
          >
            {printingWaybill || creatingWaybill
              ? "جاري التحميل"
              : waybillPrinted
                ? "مطبوع"
                : printSokanyAwb
                  ? "طباعة بوليصة سوكانى"
                  : "طباعة البوليصة"}
          </button>
        </div>
      </div>
      ) : null}

      {showWaybill && waybillCreatePrompt ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-[#14213D]/15">
            <p className="text-base font-extrabold text-[#14213D]">مفيش بوليصة على بوسطة</p>
            <p className="mt-2 text-sm font-bold text-[#14213D]/80">هذا الأوردر لا توجد له بوليصة على بوسطة. هل تريد عمل بوليصة؟</p>
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
    </div>
  );
}
