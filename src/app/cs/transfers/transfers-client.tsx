"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type StockProduct = {
  id: number;
  name: string;
  sku: string;
  model: string;
  stockQuantity: number;
  threshold: number;
  stockStatus: string;
  isAtOrBelowThreshold: boolean;
  suggestedTransferQty: number;
  categoryNames: string;
};

type StockCategory = {
  id: number;
  name: string;
};

export function CsTransfersClient() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(searchParams.get("low") === "1");
  const [categoryId, setCategoryId] = useState("");
  const [draftThresholds, setDraftThresholds] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const qs = new URLSearchParams();
    if (lowOnly) qs.set("lowOnly", "1");
    if (search.trim()) qs.set("search", search.trim());
    if (categoryId) qs.set("categoryId", categoryId);
    try {
      const res = await fetch(`/api/cs/transfers/stock?${qs.toString()}`);
      const data = (await res.json()) as {
        products?: StockProduct[];
        categories?: StockCategory[];
        fetchedAt?: string;
        message?: string;
      };
      if (!res.ok) {
        setMessage(data.message || "تعذر التحميل.");
        setLoading(false);
        return;
      }
      setProducts(data.products || []);
      setCategories(data.categories || []);
      setFetchedAt(data.fetchedAt || "");
      const drafts: Record<number, string> = {};
      for (const p of data.products || []) {
        drafts[p.id] = String(p.threshold);
      }
      setDraftThresholds(drafts);
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    }
    setLoading(false);
  }, [lowOnly, search, categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lowCount = useMemo(
    () => products.filter((p) => p.isAtOrBelowThreshold).length,
    [products],
  );

  async function saveThreshold(productId: number) {
    const raw = draftThresholds[productId];
    const threshold = Number(raw);
    if (!Number.isFinite(threshold) || threshold < 0) {
      setMessage("حد الطلب غير صالح.");
      return;
    }
    setSavingId(productId);
    setMessage("");
    const res = await fetch("/api/cs/transfers/stock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, threshold }),
    });
    const data = (await res.json()) as { product?: StockProduct; message?: string };
    setSavingId(null);
    if (!res.ok) {
      setMessage(data.message || "تعذر الحفظ.");
      return;
    }
    if (data.product) {
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, ...data.product! } : p)));
      setDraftThresholds((prev) => ({ ...prev, [productId]: String(data.product!.threshold) }));
    }
    setMessage("تم حفظ حد الطلب.");
  }

  function downloadCsv() {
    const headers = ["اسم المنتج", "الموديل", "SKU", "الكمية", "حد الطلب", "الحالة"];
    const rows = products.map((p) => [
      p.name,
      p.model,
      p.sku,
      String(p.stockQuantity),
      String(p.threshold),
      p.isAtOrBelowThreshold ? "وصلت حد الطلب" : "طبيعي",
    ]);
    const csv = `\uFEFF${[headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transfers-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
        <h1 className="text-2xl font-extrabold text-[#14213D]">التحويلات — مخزون الموقع</h1>
        <p className="mt-1 text-sm font-bold text-[#14213D]/70">
          اسم المنتج والموديل والكمية وحد الطلب. عند الوصول للحد يصلك تنبيه جرس وواتساب.
          {fetchedAt ? (
            <span className="mr-2 text-xs text-[#14213D]/50">
              آخر تحديث: {new Date(fetchedAt).toLocaleString("ar-EG")}
            </span>
          ) : null}
        </p>
        <p className="mt-2 text-sm font-extrabold text-[#14213D]">
          الأصناف: {products.length} — تحت الحد:{" "}
          <span className="rounded bg-amber-500 px-2 py-0.5 text-black">{lowCount}</span>
        </p>
      </div>

      {message ? (
        <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p>
      ) : null}

      <div className="grid gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث: اسم / موديل / SKU"
          className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
        >
          <option value="">كل التصنيفات</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="accent-[#FCA311]"
          />
          تحت حد الطلب فقط
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {loading ? "جاري…" : "تحديث"}
        </button>
        <button
          type="button"
          onClick={downloadCsv}
          className="rounded-xl bg-[#FCA311] px-3 py-2 text-sm font-extrabold text-black"
        >
          تصدير CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full text-sm">
          <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
            <tr>
              <th className="px-3 py-2">المنتج</th>
              <th className="px-3 py-2">الموديل</th>
              <th className="px-3 py-2">الكمية</th>
              <th className="px-3 py-2">حد الطلب</th>
              <th className="px-3 py-2">الحالة</th>
              <th className="px-3 py-2">حفظ</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[#14213D]/60">
                  {loading ? "جاري التحميل…" : "لا توجد أصناف مطابقة."}
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  className={`border-t border-[#E5E5E5] ${
                    p.isAtOrBelowThreshold ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-bold">
                    <div>{p.name}</div>
                    <div className="text-[11px] font-normal text-[#14213D]/50" dir="ltr">
                      {p.sku}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-bold" dir="ltr">
                    {p.model}
                  </td>
                  <td className="px-3 py-2 font-extrabold">{p.stockQuantity}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={draftThresholds[p.id] ?? String(p.threshold)}
                      onChange={(e) =>
                        setDraftThresholds((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      className="w-20 rounded-lg border border-[#E5E5E5] px-2 py-1 text-center font-bold"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {p.isAtOrBelowThreshold ? (
                      <span className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-extrabold text-black">
                        تحت الحد
                      </span>
                    ) : (
                      <span className="text-xs text-[#14213D]/55">طبيعي</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={savingId === p.id}
                      onClick={() => void saveThreshold(p.id)}
                      className="rounded-lg bg-[#14213D] px-2 py-1 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {savingId === p.id ? "…" : "حفظ"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
