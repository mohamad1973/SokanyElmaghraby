"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Kind = "refused" | "return" | "exchange";
type TabId = "bosta" | "temima" | "eid" | "momen";
type Condition = "sound" | "broken" | "defective";
type Defect = "break" | "power" | "disassembled" | "dented";
type Phase = "choose" | "defects" | "hand" | "claim" | "saved";

type Review = {
  condition: Condition;
  defects: Defect[];
  destination: "online_warehouse" | "shelf" | "maintenance";
  bostaClaim: boolean;
  label: string;
};

type LocalRow = {
  confirmationId: number;
  day: string;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
  searchText: string;
};

type LinkedProduct = {
  productId: number;
  productName: string;
  productCode: string;
};

type BostaRow = Omit<LocalRow, "confirmationId"> & {
  trackingNumber: string;
  confirmationId: number | null;
  kind: Kind;
  statusLabel: string;
  reasonText: string;
  review: Review | null;
  orderProduct: string;
  linkedProducts: LinkedProduct[];
};

type CourierSection = {
  found: boolean;
  rows: LocalRow[];
};

type Payload = {
  from: string;
  to: string;
  bosta: { rows: BostaRow[]; error: string | null };
  temima: { rows: LocalRow[] };
  eid: CourierSection;
  momen: CourierSection;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "bosta", label: "بوسطة" },
  { id: "temima", label: "تميمة" },
  { id: "eid", label: "عيد" },
  { id: "momen", label: "مؤمن" },
];

const KINDS: Array<{ id: Kind; label: string }> = [
  { id: "refused", label: "رفض استلام" },
  { id: "exchange", label: "استبدال" },
  { id: "return", label: "استرجاع" },
];

const DEFECTS: Array<{ id: Defect; label: string }> = [
  { id: "break", label: "كسر" },
  { id: "power", label: "فاصل بور" },
  { id: "disassembled", label: "مفكك" },
  { id: "dented", label: "مخبوط" },
];

const KIND_RANK: Record<Kind, number> = { refused: 0, exchange: 1, return: 2 };

function matchesQuery(searchText: string, raw: string) {
  const query = raw.trim().toLowerCase();
  if (!query) return true;
  const hay = searchText.toLowerCase();
  if (hay.includes(query)) return true;
  const digits = query.replace(/\D/g, "");
  return digits.length >= 4 && hay.replace(/\D/g, "").includes(digits);
}

function groupRows(rows: BostaRow[]) {
  return KINDS.flatMap((kind) => rows.filter((row) => row.kind === kind.id));
}

function LocalTable({ rows, loading, empty, missing }: { rows: LocalRow[]; loading: boolean; empty: string; missing?: string }) {
  if (missing) return <p className="px-4 py-6 text-center text-sm font-bold text-[#14213D]/60">{missing}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-right text-sm">
        <thead className="bg-[#F5F5F0] text-xs font-extrabold text-[#14213D]">
          <tr>
            <th className="px-3 py-2">اليوم</th>
            <th className="px-3 py-2">الأوردر</th>
            <th className="px-3 py-2">العميل</th>
            <th className="px-3 py-2">الموبايل</th>
            <th className="px-3 py-2">المنتج</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.confirmationId} className="border-t border-black/5">
                <td className="px-3 py-2">{row.day || "—"}</td>
                <td className="px-3 py-2 font-extrabold">{row.wooOrderNumber || "—"}</td>
                <td className="px-3 py-2">{row.customerName || "—"}</td>
                <td className="px-3 py-2">{row.phone || "—"}</td>
                <td className="px-3 py-2">{row.product || "—"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center font-bold text-[#14213D]/60">
                {loading ? "جارٍ التحميل…" : empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function productText(product: LinkedProduct) {
  return [product.productName, product.productCode].filter(Boolean).join(" · ");
}

function productsLabel(products: LinkedProduct[], orderProduct: string) {
  if (products.length) return products.map(productText).join("، ");
  return orderProduct || "";
}

function ProductSearch({
  row,
  onClose,
  onSaved,
}: {
  row: BostaRow;
  onClose: () => void;
  onSaved: (product: LinkedProduct) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ id: number; name: string; displayCode: string; sku: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError("");
      void fetch(`/api/products/search?q=${encodeURIComponent(term)}`, { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as { products?: Array<{ id: number; name: string; displayCode: string; sku: string }> };
          setHits(Array.isArray(body.products) ? body.products : []);
        })
        .catch(() => setError("تعذر البحث عن المنتج."))
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function choose(hit: { id: number; name: string; displayCode: string; sku: string }) {
    setSavingId(hit.id);
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber: row.trackingNumber,
          productId: hit.id,
          productName: hit.name,
          productCode: hit.displayCode || hit.sku,
        }),
      });
      const body = (await response.json()) as { message?: string; product?: LinkedProduct };
      if (!response.ok || !body.product) {
        setError(body.message || "تعذر ربط المنتج.");
        return;
      }
      onSaved(body.product);
      onClose();
    } catch {
      setError("تعذر ربط المنتج.");
    } finally {
      setSavingId(0);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" dir="rtl">
      <div className="w-full max-w-lg space-y-3 rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-[#14213D]/60">المنتج المستلم</p>
            <h2 className="text-lg font-extrabold text-[#14213D]">{row.wooOrderNumber || row.trackingNumber}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-extrabold">
            إغلاق
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="اسم المنتج أو رقم الموديل"
          className="w-full rounded-2xl border border-black/10 px-3 py-3 text-sm font-bold"
        />
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {searching ? <p className="text-sm font-bold text-[#14213D]/60">جارٍ البحث…</p> : null}
          {!searching && query.trim().length >= 2 && !hits.length ? (
            <p className="text-sm font-bold text-[#14213D]/60">مفيش منتج بالاسم ده.</p>
          ) : null}
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              disabled={savingId === hit.id}
              onClick={() => void choose(hit)}
              className="block w-full rounded-2xl bg-[#F5F5F0] px-3 py-3 text-right disabled:opacity-60"
            >
              <span className="block text-sm font-extrabold text-[#14213D]">{hit.name}</span>
              <span className="block text-xs font-bold text-[#14213D]/60">{hit.displayCode || hit.sku}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewCards({
  row,
  onClose,
  onSaved,
}: {
  row: BostaRow;
  onClose: () => void;
  onSaved: (review: Review) => void;
}) {
  const [phase, setPhase] = useState<Phase>(row.review ? "saved" : "choose");
  const [condition, setCondition] = useState<Condition | "">(row.review?.condition || "");
  const [defects, setDefects] = useState<Defect[]>(row.review?.defects || []);
  const [savedReview, setSavedReview] = useState<Review | null>(row.review);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const refused = row.kind === "refused";

  function choose(next: Condition) {
    setError("");
    setCondition(next);
    setDefects([]);
    setPhase(next === "defective" ? "defects" : "hand");
  }

  function toggleDefect(defect: Defect) {
    setDefects((current) => (current.includes(defect) ? current.filter((item) => item !== defect) : [...current, defect]));
  }

  async function finish() {
    if (!condition) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber: row.trackingNumber, condition, defects }),
      });
      const body = (await response.json()) as { message?: string; review?: Review };
      if (!response.ok || !body.review) {
        setError(body.message || "تعذر حفظ الفحص.");
        return;
      }
      onSaved(body.review);
      setSavedReview(body.review);
      setPhase("saved");
    } catch {
      setError("تعذر حفظ الفحص.");
    } finally {
      setSaving(false);
    }
  }

  const handText =
    condition === "sound" && refused
      ? "الرجوع إلى مخزن أونلاين"
      : condition === "sound"
        ? "يعود إلى الرف"
        : "يسلم إلى الصيانة";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" dir="rtl">
      <div className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-[#14213D]/60">{row.statusLabel}</p>
            <h2 className="text-lg font-extrabold text-[#14213D]">{row.wooOrderNumber || row.trackingNumber}</h2>
            <p className="text-sm font-bold text-[#14213D]/70">
              {row.customerName || "—"} · {row.product || "—"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-extrabold">
            إغلاق
          </button>
        </div>
        {row.confirmationId ? (
          <Link href={`/cs/orders/${row.confirmationId}`} className="inline-block text-sm font-extrabold text-[#14213D] underline">
            فتح صفحة الأوردر
          </Link>
        ) : null}
        {phase === "saved" && savedReview ? (
          <div className="space-y-3">
            <p className="rounded-2xl bg-emerald-50 px-4 py-6 text-center text-xl font-extrabold text-emerald-900">{savedReview.label}</p>
            <button
              type="button"
              onClick={() => setPhase("choose")}
              className="w-full rounded-2xl bg-[#F5F5F0] px-4 py-3 text-sm font-extrabold"
            >
              تعديل
            </button>
          </div>
        ) : null}
        {phase === "choose" ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => choose("sound")} className="rounded-2xl bg-[#14213D] px-4 py-8 text-xl font-extrabold text-white">
              سليم
            </button>
            <button
              type="button"
              onClick={() => choose(refused ? "broken" : "defective")}
              className="rounded-2xl bg-[#E6B325] px-4 py-8 text-xl font-extrabold text-black"
            >
              {refused ? "مكسور" : "معيب"}
            </button>
          </div>
        ) : null}
        {phase === "defects" ? (
          <div className="space-y-3">
            <p className="text-sm font-extrabold text-[#14213D]">اختَر العيب. يمكن أكثر من واحد.</p>
            <div className="grid grid-cols-2 gap-2">
              {DEFECTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleDefect(item.id)}
                  className={`rounded-2xl px-3 py-4 text-sm font-extrabold ${
                    defects.includes(item.id) ? "bg-[#E6B325] text-black" : "bg-[#F5F5F0] text-[#14213D]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!defects.length}
              onClick={() => setPhase("hand")}
              className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        ) : null}
        {phase === "hand" ? (
          <div className="space-y-3">
            <p className="rounded-2xl bg-[#F5F5F0] px-4 py-8 text-center text-xl font-extrabold text-[#14213D]">{handText}</p>
            {condition === "broken" ? (
              <button type="button" onClick={() => setPhase("claim")} className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white">
                التالي
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void finish()}
                className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {saving ? "جارٍ الحفظ…" : "تم"}
              </button>
            )}
          </div>
        ) : null}
        {phase === "claim" ? (
          <div className="space-y-3">
            <p className="rounded-2xl bg-[#F5F5F0] px-4 py-8 text-center text-xl font-extrabold text-[#14213D]">رفع تذكرة للتعويض من بوسطة</p>
            <button
              type="button"
              disabled={saving}
              onClick={() => void finish()}
              className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {saving ? "جارٍ الحفظ…" : "تم"}
            </button>
          </div>
        ) : null}
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}

export function MaintenanceClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabId>("bosta");
  const [kinds, setKinds] = useState<Kind[]>(["refused", "exchange", "return"]);
  const [grouped, setGrouped] = useState(false);
  const [active, setActive] = useState<BostaRow | null>(null);
  const [linking, setLinking] = useState<BostaRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (range?: { from: string; to: string }) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (range?.from) params.set("from", range.from);
      if (range?.to) params.set("to", range.to);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/api/cs/maintenance/returns${suffix}`, { cache: "no-store" });
      const body = (await response.json()) as Payload & { message?: string };
      if (!response.ok) {
        setError(body.message || "تعذر تحميل المرتجعات.");
        return;
      }
      setData(body);
      setFrom(body.from);
      setTo(body.to);
    } catch {
      setError("تعذر تحميل المرتجعات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load({ from, to });
  }

  async function capture() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns/capture", { method: "POST" });
      const body = (await response.json()) as { message?: string; found?: number; saved?: number };
      if (!response.ok) {
        setError(body.message || "تعذر حفظ مرتجعات بوسطة.");
        return;
      }
      setNotice(`اتحفظ ${body.saved ?? 0} من ${body.found ?? 0} ظاهرين على بوسطة.`);
      await load({ from, to });
    } catch {
      setError("تعذر حفظ مرتجعات بوسطة.");
    } finally {
      setSaving(false);
    }
  }

  function toggleKind(kind: Kind) {
    setKinds((current) => (current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]));
  }

  function patchProducts(trackingNumber: string, linkedProducts: LinkedProduct[]) {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        bosta: {
          ...current.bosta,
          rows: current.bosta.rows.map((row) => {
            if (row.trackingNumber !== trackingNumber) return row;
            const product = productsLabel(linkedProducts, row.orderProduct);
            return { ...row, linkedProducts, product, searchText: `${row.searchText} ${product}` };
          }),
        },
      };
    });
    setActive((current) => {
      if (!current || current.trackingNumber !== trackingNumber) return current;
      const product = productsLabel(linkedProducts, current.orderProduct);
      return { ...current, linkedProducts, product };
    });
  }

  function rememberProduct(trackingNumber: string, linkedProduct: LinkedProduct) {
    const current = data?.bosta.rows.find((row) => row.trackingNumber === trackingNumber);
    const existing = current?.linkedProducts || [];
    const next = existing.some((item) => item.productId === linkedProduct.productId)
      ? existing.map((item) => (item.productId === linkedProduct.productId ? linkedProduct : item))
      : [...existing, linkedProduct];
    patchProducts(trackingNumber, next);
  }

  async function removeProduct(trackingNumber: string, productId: number) {
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns/product", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber, productId }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message || "تعذر شيل المنتج.");
        return;
      }
      const current = data?.bosta.rows.find((row) => row.trackingNumber === trackingNumber);
      patchProducts(
        trackingNumber,
        (current?.linkedProducts || []).filter((item) => item.productId !== productId),
      );
    } catch {
      setError("تعذر شيل المنتج.");
    }
  }

  function rememberReview(trackingNumber: string, review: Review) {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        bosta: {
          ...current.bosta,
          rows: current.bosta.rows.map((row) =>
            row.trackingNumber === trackingNumber
              ? { ...row, review, searchText: `${row.searchText} ${review.label}` }
              : row,
          ),
        },
      };
    });
    setActive((current) => (current && current.trackingNumber === trackingNumber ? { ...current, review } : current));
  }

  function visible<T extends { searchText: string }>(rows: T[]) {
    return rows.filter((row) => matchesQuery(row.searchText, query));
  }

  const bostaSearched = visible(data?.bosta.rows || []);
  const bostaFiltered = bostaSearched.filter((row) => kinds.includes(row.kind));
  const bostaRows = grouped
    ? [...bostaFiltered].sort(
        (left, right) =>
          KIND_RANK[left.kind] - KIND_RANK[right.kind] ||
          right.day.localeCompare(left.day) ||
          right.trackingNumber.localeCompare(left.trackingNumber),
      )
    : bostaFiltered;
  const printGroups = groupRows(bostaFiltered);
  const temimaRows = visible(data?.temima.rows || []);
  const eidRows = visible(data?.eid.rows || []);
  const momenRows = visible(data?.momen.rows || []);
  const counts = {
    refused: bostaSearched.filter((row) => row.kind === "refused").length,
    exchange: bostaSearched.filter((row) => row.kind === "exchange").length,
    return: bostaSearched.filter((row) => row.kind === "return").length,
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-extrabold ${
                tab === item.id ? "bg-[#14213D] text-white" : "bg-white text-[#14213D] ring-1 ring-black/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-extrabold text-[#14213D]">
            من
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="text-xs font-extrabold text-[#14213D]">
            إلى
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="min-w-56 flex-1 text-xs font-extrabold text-[#14213D]">
            بحث
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="أوردر أو تليفون أو أي بيان"
              className="mt-1 block w-full rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-[#E6B325] px-4 py-2 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جارٍ البحث…" : "بحث"}
          </button>
        </form>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{notice}</p> : null}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/10">
        {tab === "bosta" ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {KINDS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleKind(item.id)}
                    className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                      kinds.includes(item.id) ? "bg-[#E6B325] text-black" : "bg-[#F5F5F0] text-[#14213D]/50"
                    }`}
                  >
                    {item.label} {counts[item.id]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={!bostaRows.length}
                  className="rounded-full bg-white px-4 py-2 text-xs font-extrabold text-[#14213D] ring-1 ring-black/10 disabled:opacity-40"
                >
                  طباعة
                </button>
                <button
                  type="button"
                  onClick={() => void capture()}
                  disabled={saving}
                  className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-60"
                >
                  {saving ? "جارٍ الحفظ…" : "حفظ ظاهر بوسطة"}
                </button>
              </div>
            </header>
            {data?.bosta.error ? <p className="px-4 py-3 text-sm font-bold text-red-700">{data.bosta.error}</p> : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-[#F5F5F0] text-xs font-extrabold text-[#14213D]">
                  <tr>
                    <th className="px-3 py-2">اليوم</th>
                    <th className="px-3 py-2">البوليصة</th>
                    <th className="px-3 py-2">الأوردر</th>
                    <th className="px-3 py-2">العميل</th>
                    <th className="px-3 py-2">الموبايل</th>
                    <th className="px-3 py-2">المنتج</th>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => setGrouped((value) => !value)} className="font-extrabold">
                        التصنيف{grouped ? " (مجمّع)" : ""}
                      </button>
                    </th>
                    <th className="px-3 py-2">الفحص</th>
                  </tr>
                </thead>
                <tbody>
                  {bostaRows.length ? (
                    bostaRows.map((row) => (
                      <tr
                        key={row.trackingNumber}
                        onClick={() => setActive(row)}
                        className="cursor-pointer border-t border-black/5 hover:bg-[#F5F5F0]"
                      >
                        <td className="px-3 py-2">{row.day || "—"}</td>
                        <td className="px-3 py-2 font-bold">{row.trackingNumber}</td>
                        <td className="px-3 py-2 font-extrabold">{row.wooOrderNumber || "—"}</td>
                        <td className="px-3 py-2">{row.customerName || "—"}</td>
                        <td className="px-3 py-2">{row.phone || "—"}</td>
                        <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                          <div className="flex flex-wrap items-center gap-1">
                            {row.linkedProducts.length
                              ? row.linkedProducts.map((item) => (
                                  <span
                                    key={item.productId}
                                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#F5F5F0] px-2 py-1 text-xs font-bold text-[#14213D]"
                                  >
                                    <span className="truncate">{productText(item)}</span>
                                    <button
                                      type="button"
                                      aria-label="شيل المنتج"
                                      onClick={() => void removeProduct(row.trackingNumber, item.productId)}
                                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-red-700 ring-1 ring-red-200"
                                    >
                                      −
                                    </button>
                                  </span>
                                ))
                              : row.orderProduct
                                ? <span className="text-sm font-bold text-[#14213D]">{row.orderProduct}</span>
                                : null}
                            <button
                              type="button"
                              aria-label="إضافة منتج"
                              onClick={() => setLinking(row)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#14213D] text-base font-extrabold text-white"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2">{row.statusLabel}</td>
                        <td className="px-3 py-2">{row.review?.label || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center font-bold text-[#14213D]/60">
                        {loading ? "جارٍ التحميل…" : "مفيش مرتجعات محفوظة في المدى. احفظ الظاهر على بوسطة الأول."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {tab === "temima" ? (
          <LocalTable rows={temimaRows} loading={loading} empty="مفيش إلغاء على الشيت في المدى." />
        ) : null}
        {tab === "eid" ? (
          <LocalTable
            rows={eidRows}
            loading={loading}
            empty="مفيش إلغاء على شيت عيد في المدى."
            missing={data && !data.eid.found ? "المندوب مش متسجل." : ""}
          />
        ) : null}
        {tab === "momen" ? (
          <LocalTable
            rows={momenRows}
            loading={loading}
            empty="مفيش إلغاء على شيت مؤمن في المدى."
            missing={data && !data.momen.found ? "المندوب مش متسجل." : ""}
          />
        ) : null}
      </section>
      {linking ? (
        <ProductSearch
          key={linking.trackingNumber}
          row={linking}
          onClose={() => setLinking(null)}
          onSaved={(product) => rememberProduct(linking.trackingNumber, product)}
        />
      ) : null}
      {active ? (
        <ReviewCards
          key={active.trackingNumber}
          row={active}
          onClose={() => setActive(null)}
          onSaved={(review) => rememberReview(active.trackingNumber, review)}
        />
      ) : null}
      {tab === "bosta" ? (
        <div className="print-only">
          <h1 className="text-center text-lg font-extrabold">
            مرتجعات بوسطة {from} — {to}
          </h1>
          {KINDS.map((kind) => {
            const rows = printGroups.filter((row) => row.kind === kind.id);
            if (!rows.length) return null;
            return (
              <section key={kind.id}>
                <h2 className="mt-4 text-sm font-extrabold">
                  {kind.label} ({rows.length})
                </h2>
                <table className="w-full border-collapse text-right text-xs">
                  <thead>
                    <tr>
                      <th className="border border-black px-1 py-1">اليوم</th>
                      <th className="border border-black px-1 py-1">البوليصة</th>
                      <th className="border border-black px-1 py-1">الأوردر</th>
                      <th className="border border-black px-1 py-1">العميل</th>
                      <th className="border border-black px-1 py-1">الموبايل</th>
                      <th className="border border-black px-1 py-1">المنتج</th>
                      <th className="border border-black px-1 py-1">الفحص</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr key={item.trackingNumber}>
                        <td className="border border-black px-1 py-1">{item.day}</td>
                        <td className="border border-black px-1 py-1">{item.trackingNumber}</td>
                        <td className="border border-black px-1 py-1">{item.wooOrderNumber}</td>
                        <td className="border border-black px-1 py-1">{item.customerName}</td>
                        <td className="border border-black px-1 py-1">{item.phone}</td>
                        <td className="border border-black px-1 py-1">{item.product}</td>
                        <td className="border border-black px-1 py-1">{item.review?.label || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      ) : null}
      <style jsx global>{`
        .print-only {
          display: none;
        }
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-only,
          .print-only * {
            visibility: visible !important;
          }
          .print-only {
            display: block !important;
            position: absolute;
            inset: 0;
            padding: 8mm;
            background: white;
            color: black;
          }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
        }
      `}</style>
    </div>
  );
}
