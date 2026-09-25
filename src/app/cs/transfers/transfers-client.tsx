"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type TabId = "stock" | "motion" | "returns" | "tips" | "warehouses";

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

type StockCategory = { id: number; name: string };

type MotionRow = {
  productId: number;
  name: string;
  sku: string;
  model: string;
  stockQuantity: number;
  threshold: number;
  sold30: number;
  turnover: number;
  isStagnant: boolean;
  isAtOrBelowThreshold: boolean;
  defectQty30: number;
  defectRate: number;
};

type DeliveryStats = {
  total: number;
  delivered: number;
  returned: number;
  failed: number;
  inProgress: number;
  deliveryRate: number;
  returnRate: number;
};

type ReturnRow = {
  id: number;
  wooOrderNumber: string;
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  reason: string;
  isManufacturingDefect: boolean;
  createdAt: string;
};

type TipRow = {
  productId: number;
  name: string;
  sku: string;
  model: string;
  stockQuantity: number;
  sold30: number;
  turnover: number;
  reason: string;
};

type AnalyticsPayload = {
  fetchedAt: string;
  delivery: DeliveryStats;
  motion: MotionRow[];
  stagnant: MotionRow[];
  orderMore: TipRow[];
  advertise: TipRow[];
  returns: ReturnRow[];
  reasonBreakdown: Array<{ reason: string; quantity: number }>;
  message?: string;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "stock", label: "المخزون" },
  { id: "motion", label: "الحركة" },
  { id: "returns", label: "التسليم والمرتجع" },
  { id: "tips", label: "التوصيات" },
  { id: "warehouses", label: "تحويل المخازن" },
];

type WarehouseSuggestion = {
  productId: number;
  name: string;
  model: string;
  sku: string;
  onlineQty: number;
  threshold: number;
  tenthQty: number;
  tenthHomeQty: number;
  suggestedQty: number;
  source: string;
  systemRecommends: boolean;
};

type WarehouseUnmatched = {
  warehouse: string;
  code: string;
  name: string;
  qty: number;
  reason: string;
};

type WarehouseReport = {
  columns: { online: string; tenth: string; tenthHome: string };
  suggestions: WarehouseSuggestion[];
  unmatched: WarehouseUnmatched[];
};

const RETURN_REASONS = [
  "رفض استلام",
  "عنوان خاطئ",
  "تأخير التوصيل",
  "عيب صناعة",
  "منتج غير مطابق",
  "أخرى",
];

function pct(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

export function CsTransfersClient() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>("stock");
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(searchParams.get("low") === "1");
  const [categoryId, setCategoryId] = useState("");
  const [draftThresholds, setDraftThresholds] = useState<Record<number, string>>({});
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [warehouseReport, setWarehouseReport] = useState<WarehouseReport | null>(null);
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [returnForm, setReturnForm] = useState({
    wooOrderNumber: "",
    productId: "",
    productName: "",
    sku: "",
    quantity: "1",
    reason: RETURN_REASONS[0],
    reasonNote: "",
    isManufacturingDefect: false,
  });

  const loadStock = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const qs = new URLSearchParams();
    if (lowOnly) qs.set("lowOnly", "1");
    if (search.trim()) qs.set("search", search.trim());
    if (categoryId) qs.set("categoryId", categoryId);
    try {
      const res = await fetch(`/api/cs/transfers/stock?${qs.toString()}`);
      const text = await res.text();
      if (!text.trim()) {
        setMessage("تعذر جلب المنتجات من الموقع (رد فارغ). جرّب تحديث الصفحة بعد قليل.");
        setLoading(false);
        return;
      }
      let data: {
        products?: StockProduct[];
        categories?: StockCategory[];
        fetchedAt?: string;
        message?: string;
      };
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        setMessage("تعذر جلب المنتجات من الموقع. الرد غير صالح — غالباً مهلة السيرفر.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setMessage(data.message || "تعذر التحميل.");
        setLoading(false);
        return;
      }
      setProducts(data.products || []);
      setCategories(data.categories || []);
      setFetchedAt(data.fetchedAt || "");
      const drafts: Record<number, string> = {};
      for (const p of data.products || []) drafts[p.id] = String(p.threshold);
      setDraftThresholds(drafts);
      if (!(data.products || []).length) {
        setMessage("لا توجد منتجات منشورة من Woo حالياً.");
      }
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    }
    setLoading(false);
  }, [lowOnly, search, categoryId]);

  const loadAnalytics = useCallback(async (refresh = false) => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/cs/transfers/analytics${refresh ? "?refresh=1" : ""}`);
      const text = await res.text();
      if (!text.trim()) {
        setMessage("تعذر جلب التحليلات (رد فارغ).");
        setAnalyticsLoading(false);
        return;
      }
      let data: AnalyticsPayload;
      try {
        data = JSON.parse(text) as AnalyticsPayload;
      } catch {
        setMessage("تعذر جلب التحليلات — رد غير صالح.");
        setAnalyticsLoading(false);
        return;
      }
      if (!res.ok) {
        setMessage(data.message || "تعذر جلب التحليلات.");
      } else {
        setAnalytics(data);
      }
    } catch {
      setMessage("تعذر جلب التحليلات.");
    }
    setAnalyticsLoading(false);
  }, []);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  useEffect(() => {
    if (tab !== "stock" && !analytics) void loadAnalytics();
  }, [tab, analytics, loadAnalytics]);

  const lowCount = useMemo(
    () => products.filter((p) => p.isAtOrBelowThreshold).length,
    [products],
  );

  async function saveThreshold(productId: number) {
    const threshold = Number(draftThresholds[productId]);
    if (!Number.isFinite(threshold) || threshold < 0) {
      setMessage("حد الطلب غير صالح.");
      return;
    }
    setSavingId(productId);
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

  function pickProductForReturn(productId: number) {
    const p = products.find((x) => x.id === productId) || null;
    const m = analytics?.motion.find((x) => x.productId === productId) || null;
    setReturnForm((f) => ({
      ...f,
      productId: String(productId),
      productName: p?.name || m?.name || f.productName,
      sku: p?.sku || m?.sku || f.sku,
    }));
    setTab("returns");
  }

  async function submitReturn(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const res = await fetch("/api/cs/transfers/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wooOrderNumber: returnForm.wooOrderNumber,
        productId: Number(returnForm.productId),
        productName: returnForm.productName,
        sku: returnForm.sku,
        quantity: Number(returnForm.quantity) || 1,
        reason: returnForm.reason,
        reasonNote: returnForm.reasonNote,
        isManufacturingDefect:
          returnForm.isManufacturingDefect ||
          returnForm.reason === "عيب صناعة" ||
          returnForm.reason === "منتج غير مطابق",
      }),
    });
    const data = (await res.json()) as { message?: string };
    if (!res.ok) {
      setMessage(data.message || "تعذر حفظ المرتجع.");
      return;
    }
    setMessage("تم تسجيل المرتجع.");
    setReturnForm({
      wooOrderNumber: "",
      productId: "",
      productName: "",
      sku: "",
      quantity: "1",
      reason: RETURN_REASONS[0],
      reasonNote: "",
      isManufacturingDefect: false,
    });
    await loadAnalytics(true);
  }

  async function submitWarehouses(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setWarehouseLoading(true);
    const res = await fetch("/api/cs/transfers/warehouses", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    const data = (await res.json()) as WarehouseReport & { message?: string };
    setWarehouseLoading(false);
    if (!res.ok) {
      setWarehouseReport(null);
      setMessage(data.message || "تعذر قراءة ملفات المخازن.");
      return;
    }
    setWarehouseReport(data);
    setMessage(`تم بناء التقرير: ${data.suggestions?.length || 0} صنف يمكن تحويله.`);
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

  const productOptions = useMemo(() => {
    if (products.length) return products;
    return (analytics?.motion || []).map((m) => ({
      id: m.productId,
      name: m.name,
      sku: m.sku,
      model: m.model,
    }));
  }, [products, analytics]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
        <h1 className="text-2xl font-extrabold text-[#14213D]">التحويلات — مخزون وتحليلات</h1>
        <p className="mt-1 text-sm font-bold text-[#14213D]/70">
          مخزون الموقع، دوران 30 يوم، راكد، تسليم/مرتجع، وتوصيات الطلب والإعلان.
          {fetchedAt ? (
            <span className="mr-2 text-xs text-[#14213D]/50">
              مخزون: {new Date(fetchedAt).toLocaleString("ar-EG")}
            </span>
          ) : null}
        </p>
        <p className="mt-2 text-sm font-extrabold text-[#14213D]">
          الأصناف: {products.length} — تحت الحد:{" "}
          <span className="rounded bg-amber-500 px-2 py-0.5 text-black">{lowCount}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-extrabold ${
              tab === t.id ? "bg-[#14213D] text-white" : "bg-white text-[#14213D] ring-1 ring-[#14213D]/15"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message ? (
        <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p>
      ) : null}

      {tab === "stock" ? (
        <>
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
              onClick={() => void loadStock()}
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
                      className={`border-t border-[#E5E5E5] ${p.isAtOrBelowThreshold ? "bg-amber-50" : ""}`}
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
        </>
      ) : null}

      {tab === "motion" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={analyticsLoading}
              onClick={() => void loadAnalytics(true)}
              className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {analyticsLoading ? "جاري التحليل…" : "تحديث التحليل (30 يوم)"}
            </button>
            {analytics?.fetchedAt ? (
              <span className="text-xs font-bold text-[#14213D]/60">
                {new Date(analytics.fetchedAt).toLocaleString("ar-EG")}
              </span>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
            <table className="min-w-full text-sm">
              <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
                <tr>
                  <th className="px-3 py-2">المنتج</th>
                  <th className="px-3 py-2">مبيعات 30ي</th>
                  <th className="px-3 py-2">مخزون</th>
                  <th className="px-3 py-2">دوران</th>
                  <th className="px-3 py-2">عيب صناعة</th>
                  <th className="px-3 py-2">حالة</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.motion || []).slice(0, 120).map((row) => (
                  <tr
                    key={row.productId}
                    className={`border-t border-[#E5E5E5] ${row.isStagnant ? "bg-rose-50" : ""}`}
                  >
                    <td className="px-3 py-2 font-bold">
                      {row.name}
                      <div className="text-[11px] font-normal text-[#14213D]/50" dir="ltr">
                        {row.model}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-extrabold">{row.sold30}</td>
                    <td className="px-3 py-2">{row.stockQuantity}</td>
                    <td className="px-3 py-2">{row.turnover}</td>
                    <td className="px-3 py-2">
                      {row.defectQty30} ({pct(row.defectRate)})
                    </td>
                    <td className="px-3 py-2">
                      {row.isStagnant ? (
                        <span className="rounded bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">
                          راكد
                        </span>
                      ) : row.isAtOrBelowThreshold ? (
                        <span className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-bold">تحت الحد</span>
                      ) : (
                        <span className="text-xs text-[#14213D]/55">نشط</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <h2 className="text-lg font-extrabold text-[#14213D]">الأصناف الراكدة</h2>
            <p className="mt-1 text-xs font-bold text-[#14213D]/60">
              مخزون موجود ومبيعات ضعيفة/صفر خلال 30 يوماً.
            </p>
            <ul className="mt-3 space-y-1 text-sm font-bold">
              {(analytics?.stagnant || []).slice(0, 30).map((s) => (
                <li key={s.productId} className="flex flex-wrap justify-between gap-2 border-b border-[#E5E5E5] py-1">
                  <span>{s.name}</span>
                  <span className="text-[#14213D]/60">
                    مخزون {s.stockQuantity} · مبيعات {s.sold30}
                  </span>
                </li>
              ))}
              {!analytics?.stagnant?.length && !analyticsLoading ? (
                <li className="text-[#14213D]/50">لا توجد أصناف راكدة وفق التعريف الحالي.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "returns" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "شحنات الفترة", value: analytics?.delivery.total ?? "—" },
              { label: "تم التسليم", value: analytics?.delivery.delivered ?? "—" },
              {
                label: "نسبة التسليم",
                value: analytics ? pct(analytics.delivery.deliveryRate) : "—",
              },
              {
                label: "مرتجع شحن",
                value: analytics
                  ? `${analytics.delivery.returned} (${pct(analytics.delivery.returnRate)})`
                  : "—",
              },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
                <p className="text-xs font-bold text-[#14213D]/60">{card.label}</p>
                <p className="mt-1 text-2xl font-extrabold text-[#14213D]">{card.value}</p>
              </div>
            ))}
          </div>

          <form
            onSubmit={submitReturn}
            className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10 sm:grid-cols-2 lg:grid-cols-3"
          >
            <h2 className="sm:col-span-2 lg:col-span-3 text-lg font-extrabold text-[#14213D]">
              تسجيل مرتجع يدوي (سبب / عيب صناعة)
            </h2>
            <label className="grid gap-1 text-sm font-bold">
              رقم الأوردر
              <input
                value={returnForm.wooOrderNumber}
                onChange={(e) => setReturnForm((f) => ({ ...f, wooOrderNumber: e.target.value }))}
                className="rounded-xl border border-[#E5E5E5] px-3 py-2"
                dir="ltr"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              المنتج
              <select
                value={returnForm.productId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const p = productOptions.find((x) => x.id === id);
                  setReturnForm((f) => ({
                    ...f,
                    productId: e.target.value,
                    productName: p?.name || "",
                    sku: p?.sku || "",
                  }));
                }}
                required
                className="rounded-xl border border-[#E5E5E5] px-3 py-2"
              >
                <option value="">اختر منتجاً</option>
                {productOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              الكمية
              <input
                type="number"
                min={1}
                value={returnForm.quantity}
                onChange={(e) => setReturnForm((f) => ({ ...f, quantity: e.target.value }))}
                className="rounded-xl border border-[#E5E5E5] px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              السبب
              <select
                value={returnForm.reason}
                onChange={(e) => setReturnForm((f) => ({ ...f, reason: e.target.value }))}
                className="rounded-xl border border-[#E5E5E5] px-3 py-2"
              >
                {RETURN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold sm:col-span-2">
              ملاحظة
              <input
                value={returnForm.reasonNote}
                onChange={(e) => setReturnForm((f) => ({ ...f, reasonNote: e.target.value }))}
                className="rounded-xl border border-[#E5E5E5] px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={returnForm.isManufacturingDefect}
                onChange={(e) =>
                  setReturnForm((f) => ({ ...f, isManufacturingDefect: e.target.checked }))
                }
                className="accent-[#FCA311]"
              />
              عيب صناعة
            </label>
            <button
              type="submit"
              className="rounded-xl bg-[#FCA311] px-4 py-2.5 text-sm font-extrabold text-black"
            >
              حفظ المرتجع
            </button>
          </form>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
              <h3 className="font-extrabold text-[#14213D]">أسباب الارتجاع (يدوي)</h3>
              <ul className="mt-2 space-y-1 text-sm font-bold">
                {(analytics?.reasonBreakdown || []).map((r) => (
                  <li key={r.reason} className="flex justify-between border-b border-[#E5E5E5] py-1">
                    <span>{r.reason}</span>
                    <span>{r.quantity}</span>
                  </li>
                ))}
                {!analytics?.reasonBreakdown?.length ? (
                  <li className="text-[#14213D]/50">لا سجلات يدوية بعد.</li>
                ) : null}
              </ul>
            </div>
            <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
              <table className="min-w-full text-sm">
                <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
                  <tr>
                    <th className="px-3 py-2">أوردر</th>
                    <th className="px-3 py-2">منتج</th>
                    <th className="px-3 py-2">سبب</th>
                    <th className="px-3 py-2">كمية</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.returns || []).slice(0, 40).map((r) => (
                    <tr key={r.id} className="border-t border-[#E5E5E5]">
                      <td className="px-3 py-2" dir="ltr">
                        {r.wooOrderNumber || "—"}
                      </td>
                      <td className="px-3 py-2 font-bold">{r.productName}</td>
                      <td className="px-3 py-2">
                        {r.reason}
                        {r.isManufacturingDefect ? (
                          <span className="mr-1 rounded bg-rose-500 px-1 text-[10px] text-white">عيب</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{r.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "tips" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <h2 className="text-lg font-extrabold text-[#14213D]">اطلب زيادة — الفترة القادمة</h2>
            <p className="mt-1 text-xs font-bold text-[#14213D]/60">
              طلب مرتفع + مخزون منخفض/تحت الحد + جودة مقبولة.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {(analytics?.orderMore || []).map((r) => (
                <li key={r.productId} className="rounded-xl border border-[#E5E5E5] p-3">
                  <p className="font-extrabold text-[#14213D]">{r.name}</p>
                  <p className="text-xs text-[#14213D]/60">
                    مبيعات {r.sold30} · مخزون {r.stockQuantity} · دوران {r.turnover}
                  </p>
                  <p className="mt-1 text-xs font-bold text-emerald-700">{r.reason}</p>
                  <button
                    type="button"
                    className="mt-2 text-xs font-bold text-[#14213D] underline"
                    onClick={() => pickProductForReturn(r.productId)}
                  >
                    فتح تسجيل مرتجع لهذا الصنف
                  </button>
                </li>
              ))}
              {!analytics?.orderMore?.length && !analyticsLoading ? (
                <li className="text-[#14213D]/50">لا توصيات حالياً — حدّث التحليل بعد ضبط حدود الطلب.</li>
              ) : null}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <h2 className="text-lg font-extrabold text-[#14213D]">رشّح لإعلان</h2>
            <p className="mt-1 text-xs font-bold text-[#14213D]/60">
              مخزون جيد ومبيعات ضعيفة وجودة مقبولة — لزيادة الطلب.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {(analytics?.advertise || []).map((r) => (
                <li key={r.productId} className="rounded-xl border border-[#E5E5E5] p-3">
                  <p className="font-extrabold text-[#14213D]">{r.name}</p>
                  <p className="text-xs text-[#14213D]/60">
                    مبيعات {r.sold30} · مخزون {r.stockQuantity} · دوران {r.turnover}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#FCA311]">{r.reason}</p>
                </li>
              ))}
              {!analytics?.advertise?.length && !analyticsLoading ? (
                <li className="text-[#14213D]/50">لا مرشحين للإعلان وفق القواعد الحالية.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "warehouses" ? (
        <>
          <form
            onSubmit={(event) => void submitWarehouses(event)}
            className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10 md:grid-cols-4"
          >
            <label className="grid gap-1 text-xs font-extrabold text-[#14213D]">
              مخزن الأونلاين
              <input name="online" type="file" accept=".xlsx,.xls,.csv" required className="text-xs font-bold" />
            </label>
            <label className="grid gap-1 text-xs font-extrabold text-[#14213D]">
              مخزن العاشر
              <input name="tenth" type="file" accept=".xlsx,.xls,.csv" required className="text-xs font-bold" />
            </label>
            <label className="grid gap-1 text-xs font-extrabold text-[#14213D]">
              مخزن العاشر المنزلي
              <input name="tenthHome" type="file" accept=".xlsx,.xls,.csv" required className="text-xs font-bold" />
            </label>
            <button
              type="submit"
              disabled={warehouseLoading}
              className="self-end rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {warehouseLoading ? "جاري…" : "اعمل التقرير"}
            </button>
            <p className="md:col-span-4 text-xs font-bold text-[#14213D]/60">
              الملف لازم يكون فيه عمود موديل أو كود، وعمود رصيد. الصنف يظهر لما رصيد الأونلاين يوصل حد الطلب وفي العاشر أو العاشر المنزلي كمية.
            </p>
          </form>

          {warehouseReport ? (
            <>
              <p className="text-xs font-bold text-[#14213D]/60">
                الأعمدة: أونلاين {warehouseReport.columns.online} · العاشر {warehouseReport.columns.tenth} · العاشر منزلي{" "}
                {warehouseReport.columns.tenthHome}
              </p>
              <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
                    <tr>
                      <th className="px-3 py-2">الصنف</th>
                      <th className="px-3 py-2">الموديل</th>
                      <th className="px-3 py-2">أونلاين</th>
                      <th className="px-3 py-2">حد الطلب</th>
                      <th className="px-3 py-2">العاشر</th>
                      <th className="px-3 py-2">العاشر منزلي</th>
                      <th className="px-3 py-2">المقترح</th>
                      <th className="px-3 py-2">من</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warehouseReport.suggestions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-[#14213D]/60">
                          مفيش صنف أونلاينه عند الحد ومصدره فيه كمية.
                        </td>
                      </tr>
                    ) : (
                      warehouseReport.suggestions.map((row) => (
                        <tr
                          key={row.productId}
                          className={`border-t border-[#E5E5E5] ${row.systemRecommends ? "bg-amber-50" : ""}`}
                        >
                          <td className="px-3 py-2 font-bold">
                            {row.name}
                            {row.systemRecommends ? (
                              <span className="mr-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-black">
                                توصية النظام
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 font-bold" dir="ltr">
                            {row.model}
                          </td>
                          <td className="px-3 py-2 font-extrabold">{row.onlineQty}</td>
                          <td className="px-3 py-2">{row.threshold}</td>
                          <td className="px-3 py-2">{row.tenthQty}</td>
                          <td className="px-3 py-2">{row.tenthHomeQty}</td>
                          <td className="px-3 py-2 font-extrabold">{row.suggestedQty}</td>
                          <td className="px-3 py-2 font-bold">{row.source}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
                <p className="px-3 py-2 text-sm font-extrabold text-[#14213D]">لم تُطابق ({warehouseReport.unmatched.length})</p>
                <table className="min-w-full text-sm">
                  <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
                    <tr>
                      <th className="px-3 py-2">المخزن</th>
                      <th className="px-3 py-2">الكود</th>
                      <th className="px-3 py-2">الاسم</th>
                      <th className="px-3 py-2">الرصيد</th>
                      <th className="px-3 py-2">السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warehouseReport.unmatched.slice(0, 80).map((row, index) => (
                      <tr key={`${row.warehouse}-${row.code}-${index}`} className="border-t border-[#E5E5E5]">
                        <td className="px-3 py-2">{row.warehouse}</td>
                        <td className="px-3 py-2 font-bold" dir="ltr">
                          {row.code}
                        </td>
                        <td className="px-3 py-2">{row.name || "—"}</td>
                        <td className="px-3 py-2">{row.qty}</td>
                        <td className="px-3 py-2">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
