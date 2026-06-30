"use client";

import { useMemo, useState } from "react";

type ExportOrder = {
  id: number;
  number: string;
  customerName: string;
  phone: string;
  address: string;
  governorate: string;
  area: string;
  status: string;
  paymentMethod: string;
  total: string;
  currency: string;
  dateCreated: string;
};

const exportHeaders = [
  "رقم الأوردر",
  "اسم العميل",
  "رقم التليفون",
  "إجمالي القيمة",
  "طريقة الدفع",
  "حالة الدفع/الطلب",
  "التاريخ",
  "العنوان",
  "المحافظة",
  "المنطقة",
];

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getExportRows(orders: ExportOrder[]) {
  return orders.map((order) => [
    `#${order.number}`,
    order.customerName,
    order.phone,
    `${order.total} ${order.currency}`,
    order.paymentMethod,
    order.status,
    formatOrderDate(order.dateCreated),
    order.address,
    order.governorate,
    order.area,
  ]);
}

function escapeCsvCell(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function buildCsv(orders: ExportOrder[]) {
  const rows = [exportHeaders, ...getExportRows(orders)];

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildPrintHtml(orders: ExportOrder[]) {
  const rows = getExportRows(orders)
    .map((row) => `
      <tr>
        ${row.map((cell) => `<td>${cell}</td>`).join("")}
      </tr>
    `)
    .join("");

  return `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تصدير الطلبات</title>
        <style>
          body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #111; }
          h1 { margin: 0 0 16px; font-size: 22px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: right; vertical-align: top; }
          th { background: #101010; color: #daff00; }
          tr:nth-child(even) td { background: #f7f7f7; }
        </style>
      </head>
      <body>
        <h1>تصدير الطلبات</h1>
        <table>
          <thead>
            <tr>${exportHeaders.map((header) => `<th>${header}</th>`).join("")}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
}

export function OrdersExportActions({ orders }: { orders: ExportOrder[] }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const exportRows = useMemo(() => getExportRows(orders), [orders]);
  const filename = `sokany-orders-${new Date().toISOString().slice(0, 10)}.csv`;

  function exportExcel() {
    downloadFile(buildCsv(orders), filename, "text/csv;charset=utf-8");
  }

  function printPdf() {
    setIsPreviewOpen(true);

    const printWindow = window.open("", "_blank", "width=1200,height=800");

    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(buildPrintHtml(orders));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function shareWhatsapp() {
    const csvBlob = new Blob([buildCsv(orders)], { type: "text/csv;charset=utf-8" });
    const file = new File([csvBlob], filename, { type: "text/csv" });
    const shareData = {
      title: "تصدير الطلبات",
      text: `تصدير ${orders.length} طلب من لوحة Sokany.`,
      files: [file],
    };
    const navigatorWithFiles = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };

    if (navigatorWithFiles.canShare?.(shareData) && navigatorWithFiles.share) {
      await navigatorWithFiles.share(shareData);
      return;
    }

    const message = encodeURIComponent(`تم تجهيز ملف تصدير الطلبات (${orders.length} طلب). يمكنك تنزيل ملف Excel من لوحة الطلبات ثم إرساله.`);
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="rounded-md border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-950">تصدير الطلبات</h2>
          <p className="mt-1 text-sm text-zinc-500">راجع البيانات قبل الطباعة أو الحفظ أو المشاركة.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsPreviewOpen((currentValue) => !currentValue)}
            className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
          >
            {isPreviewOpen ? "إخفاء المعاينة" : "معاينة التصدير"}
          </button>
          <button type="button" onClick={exportExcel} className="rounded-md bg-brand-gold px-4 py-2 text-sm font-bold text-black">
            تصدير Excel
          </button>
          <button type="button" onClick={printPdf} className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-bold text-white">
            طباعة / حفظ PDF
          </button>
          <button type="button" onClick={() => void shareWhatsapp()} className="rounded-md bg-green-600 px-4 py-2 text-sm font-bold text-white">
            إرسال واتساب
          </button>
        </div>
      </div>

      {isPreviewOpen ? (
        <div className="mt-4 max-h-[60vh] overflow-auto rounded-md border border-black/10">
          <table className="min-w-[1300px] border-collapse text-right text-xs">
            <thead className="bg-zinc-950 text-brand-gold">
              <tr>
                {exportHeaders.map((header) => (
                  <th key={header} className="border-b border-white/10 px-3 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exportRows.map((row, rowIndex) => (
                <tr key={`${row[0]}-${rowIndex}`} className="odd:bg-white even:bg-zinc-50">
                  {row.map((cell, cellIndex) => (
                    <td key={`${row[0]}-${cellIndex}`} className="border-b border-black/10 px-3 py-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
