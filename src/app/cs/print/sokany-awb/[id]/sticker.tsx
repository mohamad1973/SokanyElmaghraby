"use client";

import { useEffect } from "react";

import type { SokanyPrintPayload } from "@/lib/cs/sokany-waybill-types";

const LOGO_SRC = "/cs/sokany-awb-logo.png";

function money(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function typeCode(kindLabel: string) {
  if (kindLabel === "استرجاع") return "R-25";
  if (kindLabel === "استبدال") return "X-30";
  return "A-02";
}

function createdLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleString("en-GB", {
    timeZone: "Africa/Cairo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function SokanyAwbSticker({
  payload,
  confirmationId,
}: {
  payload: SokanyPrintPayload;
  confirmationId: number;
}) {
  const code = typeCode(payload.kindLabel);

  useEffect(() => {
    void fetch(`/api/cs/confirmations/${confirmationId}/sokany-awb`, { method: "POST" });
    let printed = false;
    const print = () => {
      if (printed) return;
      printed = true;
      window.print();
    };
    const img = new Image();
    img.onload = () => window.setTimeout(print, 250);
    img.onerror = () => window.setTimeout(print, 250);
    img.src = LOGO_SRC;
    const fallback = window.setTimeout(print, 1200);
    return () => window.clearTimeout(fallback);
  }, [confirmationId]);

  return (
    <main dir="rtl" className="sokany-awb">
      <style>{`
        @page { size: 100mm 150mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { box-sizing: border-box; }
        .sokany-awb {
          font-family: Tahoma, Arial, sans-serif;
          color: #111;
          background: #fff;
        }
        @media print {
          html, body, .sokany-awb { width: 100mm; height: 150mm; overflow: hidden; }
          .no-print { display: none !important; }
        }
        .sheet-wrap {
          width: 100mm;
          height: 150mm;
          padding: 2.2mm;
          overflow: hidden;
        }
        .sheet {
          width: 100%;
          height: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 1.5pt solid #000;
        }
        .sheet td {
          border: 0.7pt solid #000;
          padding: 1.1mm 1.4mm;
          vertical-align: middle;
          overflow: hidden;
        }
        .barcode-cell { height: 24mm; text-align: center; padding: 1.4mm 2mm 1mm !important; }
        .barcode {
          height: 16mm;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .barcode svg { display: block; width: 100%; height: 16mm; }
        .track-under {
          margin: 0.8mm 0 0;
          font-size: 9.5pt;
          font-weight: 800;
          letter-spacing: 0.4px;
          line-height: 1.1;
        }
        .hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5mm;
          height: 9mm;
        }
        .hdr-kind { font-size: 11pt; font-weight: 800; }
        .hdr-hub { flex: 1; text-align: center; font-size: 9pt; font-weight: 800; }
        .hdr-brand { display: flex; align-items: center; gap: 1mm; font-weight: 800; font-size: 9pt; }
        .logo {
          width: 8mm;
          height: 8mm;
          object-fit: contain;
          filter: grayscale(1) contrast(2) brightness(0);
        }
        .type-code { width: 22mm; text-align: center; font-size: 16pt; font-weight: 900; }
        .money { font-size: 8.5pt; line-height: 1.35; }
        .party { width: 50%; vertical-align: top !important; font-size: 8pt; line-height: 1.3; }
        .party strong { display: block; font-size: 8.5pt; }
        .party .name { font-size: 11pt; font-weight: 900; }
        .party .phone { direction: ltr; text-align: left; font-weight: 800; font-size: 9pt; }
        .merchant {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2mm;
        }
        .line { font-size: 8pt; line-height: 1.35; }
        .line b { font-weight: 800; }
        .open-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2mm;
        }
        .badge {
          border: 0.8pt solid #000;
          border-radius: 3mm;
          padding: 0.4mm 2.2mm;
          font-weight: 800;
          font-size: 8pt;
        }
        .notes-track { width: 42%; text-align: center; }
        .mini-barcode { height: 10mm; width: 100%; }
        .mini-barcode svg { display: block; width: 100%; height: 10mm; }
        .mini-label { font-size: 7pt; font-weight: 800; margin-bottom: 0.4mm; }
        .foot { font-size: 7.5pt; line-height: 1.3; }
        .created { direction: ltr; text-align: left; font-size: 7pt; padding: 0.6mm 1.4mm !important; }
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
      <div className="sheet-wrap mx-auto bg-white">
        <table className="sheet">
          <tbody>
            <tr>
              <td colSpan={2} className="barcode-cell">
                <div className="barcode" dangerouslySetInnerHTML={{ __html: payload.barcodeSvg }} />
                <p className="track-under">{payload.tracking}</p>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <div className="hdr">
                  <span className="hdr-kind">{payload.kindLabel}</span>
                  <span className="hdr-hub">{payload.hubLabel}</span>
                  <span className="hdr-brand">
                    <img src={LOGO_SRC} alt="" className="logo" />
                    sokany
                  </span>
                </div>
              </td>
            </tr>
            <tr>
              <td className="type-code">{code}</td>
              <td className="money">
                <div>
                  مبلغ التحصيل: <b>{money(payload.cod)} ج.م</b>
                </div>
                <div>تكلفة عدم الاستلام: {money(payload.returnFee)} ج.م</div>
              </td>
            </tr>
            <tr>
              <td className="party">
                <strong>توصيل إلى:</strong>
                <div className="name">{payload.receiverName}</div>
                <div className="phone">{payload.receiverPhone}</div>
              </td>
              <td className="party">
                <div className="merchant">
                  <div>
                    <strong>التاجر:</strong>
                    <div className="name">{payload.senderName}</div>
                  </div>
                  <img src={LOGO_SRC} alt="" className="logo" style={{ width: "11mm", height: "11mm" }} />
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="line">
                <b>المنطقة</b> | {payload.zone}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="line">
                <b>العنوان</b> | {payload.address}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="line">
                <b>علامة مميزة</b> | {payload.landmarks}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="line">
                <div className="open-row">
                  <span>
                    <b>فتح الشحنة</b> : {payload.openPackage ? "نعم" : "لا"}
                  </span>
                  <span className="badge">{payload.itemsCount} قطع</span>
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="line">
                <b>وصف الشحنة</b> | {payload.description}
              </td>
            </tr>
            <tr>
              <td className="line">
                <b>ملاحظات</b> | {payload.notes}
                <div style={{ marginTop: "1.2mm", fontSize: "7.5pt" }}>
                  الفاتورة: {payload.invoiceNumber}
                  <br />
                  {payload.orderReference}
                  {payload.legacyRef ? (
                    <>
                      <br />
                      {payload.legacyRef}
                    </>
                  ) : null}
                </div>
              </td>
              <td className="notes-track">
                <div className="mini-label">Tracking Number</div>
                <div className="mini-barcode" dangerouslySetInnerHTML={{ __html: payload.barcodeSvg }} />
                <div className="track-under" style={{ fontSize: "7.5pt" }}>
                  {payload.tracking}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="foot">
                <b>عنوان المرتجع</b> | {payload.returnAddress}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="created">
                Created {createdLabel(payload.createdAt)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
