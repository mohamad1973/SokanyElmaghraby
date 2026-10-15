"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Kind = "refused" | "return" | "exchange";
type TabId = "bosta" | "temima" | "eid" | "momen";

type LocalRow = {
  confirmationId: number;
  day: string;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
  searchText: string;
};

type BostaRow = Omit<LocalRow, "confirmationId"> & {
  trackingNumber: string;
  confirmationId: number | null;
  kind: Kind;
  statusLabel: string;
  reasonText: string;
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
  { id: "return", label: "استرجاع" },
  { id: "exchange", label: "استبدال" },
];

function OrderLink({ id, number }: { id: number | null; number: string }) {
  if (!number) return <span>—</span>;
  if (!id) return <span>{number}</span>;
  return (
    <Link href={`/cs/orders/${id}`} className="font-extrabold text-[#14213D] underline">
      {number}
    </Link>
  );
}

function matchesQuery(searchText: string, raw: string) {
  const query = raw.trim().toLowerCase();
  if (!query) return true;
  const hay = searchText.toLowerCase();
  if (hay.includes(query)) return true;
  const digits = query.replace(/\D/g, "");
  return digits.length >= 4 && hay.replace(/\D/g, "").includes(digits);
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
                <td className="px-3 py-2">
                  <OrderLink id={row.confirmationId} number={row.wooOrderNumber} />
                </td>
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

export function MaintenanceClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabId>("bosta");
  const [kinds, setKinds] = useState<Kind[]>(["refused", "return", "exchange"]);
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

  function visible<T extends { searchText: string }>(rows: T[]) {
    return rows.filter((row) => matchesQuery(row.searchText, query));
  }

  const bostaSearched = visible(data?.bosta.rows || []);
  const bostaRows = bostaSearched.filter((row) => kinds.includes(row.kind));
  const temimaRows = visible(data?.temima.rows || []);
  const eidRows = visible(data?.eid.rows || []);
  const momenRows = visible(data?.momen.rows || []);
  const counts = {
    refused: bostaSearched.filter((row) => row.kind === "refused").length,
    return: bostaSearched.filter((row) => row.kind === "return").length,
    exchange: bostaSearched.filter((row) => row.kind === "exchange").length,
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
              <button
                type="button"
                onClick={() => void capture()}
                disabled={saving}
                className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-60"
              >
                {saving ? "جارٍ الحفظ…" : "حفظ ظاهر بوسطة"}
              </button>
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
                    <th className="px-3 py-2">التصنيف</th>
                  </tr>
                </thead>
                <tbody>
                  {bostaRows.length ? (
                    bostaRows.map((row) => (
                      <tr key={row.trackingNumber} className="border-t border-black/5">
                        <td className="px-3 py-2">{row.day || "—"}</td>
                        <td className="px-3 py-2 font-bold">{row.trackingNumber}</td>
                        <td className="px-3 py-2">
                          <OrderLink id={row.confirmationId} number={row.wooOrderNumber} />
                        </td>
                        <td className="px-3 py-2">{row.customerName || "—"}</td>
                        <td className="px-3 py-2">{row.phone || "—"}</td>
                        <td className="px-3 py-2">{row.product || "—"}</td>
                        <td className="px-3 py-2">{row.statusLabel}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center font-bold text-[#14213D]/60">
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
    </div>
  );
}
