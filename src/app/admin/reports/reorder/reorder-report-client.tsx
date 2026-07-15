"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ReorderProduct = {
  id: number;
  name: string;
  sku: string;
  stockQuantity: number;
  threshold: number;
  stockStatus: string;
  manageStock: boolean;
  isAtOrBelowThreshold: boolean;
  suggestedTransferQty: number;
};

type FilterMode = "all" | "low";

const exportHeaders = ["اسم الصنف", "SKU", "الكمية على الموقع", "حد الطلب", "كمية مقترحة للتحويل", "الحالة"];

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeCsvCell(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function buildCsv(products: ReorderProduct[]) {
  const rows = [
    exportHeaders,
    ...products.map((product) => [
      product.name,
      product.sku,
      String(product.stockQuantity),
      String(product.threshold),
      String(product.suggestedTransferQty),
      product.isAtOrBelowThreshold ? "وصلت حد الطلب" : "طبيعي",
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
}

function buildPrintHtml(products: ReorderProduct[], fetchedAt: string, filterLabel: string) {
  const rows = products
    .map(
      (product) => `
      <tr class="${product.isAtOrBelowThreshold ? "low" : ""}">
        <td>${product.name}</td>
        <td>${product.sku}</td>
        <td>${product.stockQuantity}</td>
        <td>${product.threshold}</td>
        <td>${product.suggestedTransferQty}</td>
        <td>${product.isAtOrBelowThreshold ? "وصلت حد الطلب" : "طبيعي"}</td>
      </tr>`,
    )
    .join("");

  return `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تقرير حد الطلب</title>
        <style>
          body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #111; }
          h1 { margin: 0 0 8px; font-size: 22px; }
          .meta { margin: 0 0 16px; font-size: 13px; color: #444; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: right; vertical-align: top; }
          th { background: #101010; color: #daff00; }
          tr.low td { background: #fff4e5; font-weight: bold; }
          tr:nth-child(even):not(.low) td { background: #f7f7f7; }
        </style>
      </head>
      <body>
        <h1>تقرير حد الطلب — سوكاني</h1>
        <p class="meta">التاريخ: ${formatReportDate(fetchedAt)} — العرض: ${filterLabel} — عدد الأصناف: ${products.length}</p>
        <p class="meta">الغرض: تحويل من المخزن الرئيسي إلى مخزن الأونلاين على الموقع</p>
        <table>
          <thead>
            <tr>${exportHeaders.map((header) => `<th>${header}</th>`).join("")}</tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6">لا توجد أصناف</td></tr>`}</tbody>
        </table>
      </body>
    </html>
  `;
}

export function ReorderReportClient() {
  const [products, setProducts] = useState<ReorderProduct[]>([]);
  const [fetchedAt, setFetchedAt] = useState(new Date().toISOString());
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [draftThresholds, setDraftThresholds] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async (nextFilter: FilterMode, nextSearch: string) => {
    setLoading(true);
    setError("");
    setMessage("");

    const params = new URLSearchParams();
    if (nextFilter === "low") {
      params.set("lowOnly", "1");
    }
    if (nextSearch.trim()) {
      params.set("search", nextSearch.trim());
    }

    try {
      const response = await fetch(`/api/admin/reports/reorder?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "تعذر تحميل التقرير.");
      }

      const list = (payload.products || []) as ReorderProduct[];
      setProducts(list);
      setFetchedAt(payload.fetchedAt || new Date().toISOString());
      setDraftThresholds(
        Object.fromEntries(list.map((item) => [item.id, String(item.threshold)])),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل التقرير.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter, search);
  }, [filter, search, load]);

  const lowCount = useMemo(
    () => products.filter((item) => item.isAtOrBelowThreshold).length,
    [products],
  );

  const filterLabel = filter === "low" ? "وصلت حد الطلب فقط" : "كل الأصناف المدارة بالمخزون";

  async function saveThreshold(productId: number) {
    const raw = draftThresholds[productId];
    const threshold = Number(raw);

    if (!Number.isFinite(threshold) || threshold < 0) {
      setMessage("أدخل حداً صالحاً (0 أو أكثر).");
      return;
    }

    setSavingId(productId);
    setMessage("");

    try {
      const response = await fetch("/api/admin/reports/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, threshold }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "تعذر حفظ حد الطلب.");
      }

      const updated = payload.product as ReorderProduct;
      setProducts((prev) =>
        prev
          .map((item) => (item.id === productId ? updated : item))
          .filter((item) => (filter === "low" ? item.isAtOrBelowThreshold : true)),
      );
      setDraftThresholds((prev) => ({ ...prev, [productId]: String(updated.threshold) }));
      setMessage(`تم حفظ حد الطلب للصنف: ${updated.name}`);
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "تعذر حفظ حد الطلب.");
    } finally {
      setSavingId(null);
    }
  }

  function exportCsv() {
    const blob = new Blob([buildCsv(products)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sokany-reorder-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const printWindow = window.open("", "_blank", "width=1200,height=800");

    if (!printWindow) {
      window.alert("اسمح بالنوافذ المنبثقة لتصدير PDF.");
      return;
    }

    printWindow.document.write(buildPrintHtml(products, fetchedAt, filterLabel));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[#c3c4c7] bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-bold text-[#1d2327]">تاريخ التقرير</p>
          <p className="text-sm text-zinc-600">{formatReportDate(fetchedAt)}</p>
          <p className="mt-1 text-xs text-zinc-500">
            الأصناف الظاهرة: {products.length}
            {filter === "all" ? ` — منها ${lowCount} وصلت حد الطلب` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load(filter, search)}
            className="rounded-md border border-[#c3c4c7] bg-white px-3 py-2 text-sm font-bold text-[#1d2327] hover:bg-zinc-50"
          >
            تحديث
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!products.length}
            className="rounded-md border border-[#c3c4c7] bg-white px-3 py-2 text-sm font-bold text-[#1d2327] hover:bg-zinc-50 disabled:opacity-50"
          >
            تصدير Excel/CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={!products.length}
            className="rounded-md bg-[#1d2327] px-3 py-2 text-sm font-bold text-brand-gold hover:bg-black disabled:opacity-50"
          >
            تصدير PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-md px-3 py-2 text-sm font-bold ${
            filter === "all" ? "bg-brand-gold text-black" : "border border-[#c3c4c7] bg-white text-[#1d2327]"
          }`}
        >
          الكل
        </button>
        <button
          type="button"
          onClick={() => setFilter("low")}
          className={`rounded-md px-3 py-2 text-sm font-bold ${
            filter === "low" ? "bg-brand-gold text-black" : "border border-[#c3c4c7] bg-white text-[#1d2327]"
          }`}
        >
          وصلت حد الطلب
        </button>
        <form
          className="ms-auto flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draftSearch.trim());
          }}
        >
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="بحث بالاسم أو SKU"
            className="min-w-[200px] rounded-md border border-[#c3c4c7] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-[#c3c4c7] bg-white px-3 py-2 text-sm font-bold text-[#1d2327]"
          >
            بحث
          </button>
        </form>
      </div>

      {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-600">جاري تحميل كميات المخزون من WooCommerce…</p> : null}

      {!loading && !error ? (
        <div className="overflow-x-auto rounded-lg border border-[#c3c4c7] bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1d2327] text-brand-gold">
              <tr>
                <th className="px-3 py-3 text-right font-bold">اسم الصنف</th>
                <th className="px-3 py-3 text-right font-bold">SKU</th>
                <th className="px-3 py-3 text-right font-bold">الكمية على الموقع</th>
                <th className="px-3 py-3 text-right font-bold">حد الطلب</th>
                <th className="px-3 py-3 text-right font-bold">مقترح التحويل</th>
                <th className="px-3 py-3 text-right font-bold">حفظ</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    لا توجد أصناف تطابق البحث أو الفلتر (يظهر فقط المنتجات المفعّل عليها إدارة المخزون في WooCommerce).
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr
                    key={product.id}
                    className={`border-t border-[#dcdcde] ${
                      product.isAtOrBelowThreshold ? "bg-amber-50" : "bg-white"
                    }`}
                  >
                    <td className="px-3 py-3 font-medium text-[#1d2327]">
                      {product.name}
                      {product.isAtOrBelowThreshold ? (
                        <span className="ms-2 rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-950">
                          وصلت الحد
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{product.sku}</td>
                    <td className="px-3 py-3 font-bold">{product.stockQuantity}</td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draftThresholds[product.id] ?? String(product.threshold)}
                        onChange={(event) =>
                          setDraftThresholds((prev) => ({
                            ...prev,
                            [product.id]: event.target.value,
                          }))
                        }
                        className="w-24 rounded-md border border-[#c3c4c7] px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-3 font-bold text-zinc-800">{product.suggestedTransferQty}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        disabled={savingId === product.id}
                        onClick={() => void saveThreshold(product.id)}
                        className="rounded-md border border-[#c3c4c7] bg-white px-3 py-1.5 text-xs font-bold text-[#1d2327] hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {savingId === product.id ? "…" : "حفظ الحد"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
