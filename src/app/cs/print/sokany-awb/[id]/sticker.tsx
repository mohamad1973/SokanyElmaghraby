"use client";

import { useEffect } from "react";

import type { SokanyPrintPayload } from "@/lib/cs/sokany-waybill-types";

function money(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function SokanyAwbSticker({
  payload,
  confirmationId,
}: {
  payload: SokanyPrintPayload;
  confirmationId: number;
}) {
  useEffect(() => {
    void fetch(`/api/cs/confirmations/${confirmationId}/sokany-awb`, { method: "POST" });
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [confirmationId]);

  return (
    <main dir="rtl" className="sokany-awb bg-white text-black">
      <style>{`
        @page { size: 100mm 150mm; margin: 0; }
        html, body { margin: 0; }
        @media print {
          html, body { width: 100mm; height: 150mm; margin: 0; background: white; }
          .no-print { display: none !important; }
          .sokany-awb { width: 100mm; height: 150mm; }
        }
        .sokany-awb { font-family: Tahoma, Arial, sans-serif; color: #111; }
        .sokany-awb-sheet {
          box-sizing: border-box;
          width: 100mm;
          height: 150mm;
          overflow: hidden;
        }
      `}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[100mm] justify-center gap-2 pt-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[#14213D] px-3 py-1.5 text-sm font-extrabold text-white"
        >
          طباعة 10×15
        </button>
      </div>
      <article className="sokany-awb-sheet mx-auto border border-black p-2 text-[11px] leading-tight">
        <div className="h-10 w-full" dangerouslySetInnerHTML={{ __html: payload.barcodeSvg }} />
        <p className="mt-1 text-center text-[12px] font-extrabold tracking-wide">{payload.tracking}</p>
        <div className="mt-1 flex items-center justify-between border-y border-black py-1">
          <span className="font-extrabold">سوكانى</span>
          <span className="font-bold">{payload.hubLabel}</span>
          <span className="font-extrabold">{payload.kindLabel}</span>
        </div>
        <div className="grid grid-cols-[28mm_1fr] border-b border-black">
          <div className="border-l border-black p-1 text-center text-[16px] font-black">{payload.kindLabel === "توصيل" ? "A-02" : payload.kindLabel === "استرجاع" ? "R-25" : "X-30"}</div>
          <div className="p-1">
            <p>مبلغ التحصيل: <b>{money(payload.cod)} ج.م</b></p>
            <p>تكلفة عدم الاستلام: {money(payload.returnFee)} ج.م</p>
          </div>
        </div>
        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-l border-black p-1">
            <p className="font-extrabold">توصيل إلى:</p>
            <p className="text-[13px] font-black">{payload.receiverName}</p>
            <p dir="ltr" className="text-left font-bold">{payload.receiverPhone}</p>
          </div>
          <div className="p-1">
            <p className="font-extrabold">{payload.senderNameAr}</p>
            <p>{payload.senderName}</p>
          </div>
        </div>
        <p className="border-b border-black p-1">المنطقة | {payload.zone}</p>
        <p className="border-b border-black p-1">العنوان | {payload.address}</p>
        <p className="border-b border-black p-1">علامة مميزة | {payload.landmarks}</p>
        <p className="border-b border-black p-1">
          فتح الشحنة: {payload.openPackage ? "نعم" : "لا"} · {payload.itemsCount} قطع
        </p>
        <p className="border-b border-black p-1">وصف الشحنة | {payload.description}</p>
        <p className="border-b border-black p-1">ملاحظات | {payload.notes}</p>
        <div className="grid grid-cols-2 gap-1 p-1">
          <p>Tracking Number<br /><b>{payload.tracking}</b></p>
          <p>الفاتورة: {payload.invoiceNumber}<br />{payload.orderReference}</p>
        </div>
        <p className="border-t border-black p-1">عنوان المرتجع | {payload.returnAddress}</p>
        <p className="text-left text-[9px]">{payload.createdAt.slice(0, 10)}</p>
      </article>
    </main>
  );
}
