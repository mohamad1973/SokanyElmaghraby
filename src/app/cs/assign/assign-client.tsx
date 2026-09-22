"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { listCsGovernorates, mergeAreaOptions } from "@/lib/cs/egypt-areas";

type Agent = { id: number; name: string; email?: string };
type Assignment = {
  id: number;
  agentId: number;
  agentName: string;
  wooOrderNumberFrom: number;
  wooOrderNumberTo: number;
  createdAt: string;
};

type Tab = "range" | "fair" | "rules";

export function CsAssignClient({
  agents,
  visibleOrderIds = [],
}: {
  agents: Agent[];
  visibleOrderIds?: number[];
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("range");
  const [fairIds, setFairIds] = useState<number[]>([]);
  const [governorate, setGovernorate] = useState("");
  const [area, setArea] = useState("");
  const [ruleMode, setRuleMode] = useState<"shipping" | "paid" | "region_agent" | "region_shipping">(
    "shipping",
  );
  const [shipBostaAgent, setShipBostaAgent] = useState("");
  const [shipTemimaAgent, setShipTemimaAgent] = useState("");
  const [paidAgent, setPaidAgent] = useState("");
  const [unpaidAgent, setUnpaidAgent] = useState("");
  const [regionAgentId, setRegionAgentId] = useState("");
  const [regionShipping, setRegionShipping] = useState<"bosta" | "sayed_temima">("sayed_temima");

  const areas = useMemo(() => mergeAreaOptions(governorate, []), [governorate]);

  async function load() {
    const res = await fetch("/api/cs/assignments");
    const data = (await res.json()) as { assignments?: Assignment[]; message?: string };
    if (res.ok) setAssignments(data.assignments || []);
    else setMessage(data.message || "تعذر التحميل.");
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleFair(id: number) {
    setFairIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onRangeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/cs/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "range",
        agentId: Number(form.get("agentId")),
        from: Number(form.get("from")),
        to: Number(form.get("to")),
      }),
    });
    const data = (await res.json()) as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر الحفظ.");
      return;
    }
    setMessage("تم حفظ توزيع النطاق.");
    event.currentTarget.reset();
    await load();
  }

  async function runFair() {
    setLoading(true);
    setMessage("");
    if (visibleOrderIds.length === 0) {
      setLoading(false);
      setMessage("لا توجد أوردرات ظاهرة في القائمة (اليوم/أمس). زامني من قائمة الانتظار أولاً.");
      return;
    }
    const res = await fetch("/api/cs/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "fair",
        agentIds: fairIds,
        confirmationIds: visibleOrderIds,
      }),
    });
    const data = (await res.json()) as {
      message?: string;
      assigned?: number;
      ranges?: Array<{ agentId: number; from: number; to: number; count: number }>;
    };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر التقسيم.");
      return;
    }
    const byId = new Map(agents.map((a) => [a.id, a.name]));
    const rangeText = (data.ranges || [])
      .map((r) => `${byId.get(r.agentId) || r.agentId}: ${r.from}→${r.to} (${r.count})`)
      .join(" · ");
    setMessage(
      `تم التوزيع بنطاقات متتالية على ${fairIds.length} مسؤولين — ${data.assigned ?? 0} أوردر. ${rangeText}`,
    );
    await load();
  }

  async function runRules() {
    setLoading(true);
    setMessage("");
    let rules: Array<{
      agentId?: number;
      shippingCompany?: "bosta" | "sayed_temima";
      paidOnline?: boolean;
      governorate?: string;
      area?: string;
    }> = [];

    if (ruleMode === "shipping") {
      if (shipBostaAgent) rules.push({ agentId: Number(shipBostaAgent), shippingCompany: "bosta" });
      if (shipTemimaAgent) rules.push({ agentId: Number(shipTemimaAgent), shippingCompany: "sayed_temima" });
    } else if (ruleMode === "paid") {
      if (paidAgent) rules.push({ agentId: Number(paidAgent), paidOnline: true });
      if (unpaidAgent) rules.push({ agentId: Number(unpaidAgent), paidOnline: false });
    } else if (ruleMode === "region_agent") {
      if (!governorate || !regionAgentId) {
        setLoading(false);
        setMessage("اختاري محافظة ومسؤول المنطقة.");
        return;
      }
      rules = [{ agentId: Number(regionAgentId), governorate, area: area || undefined }];
    } else {
      if (!governorate) {
        setLoading(false);
        setMessage("اختاري محافظة/منطقة لتعيين شركة الشحن.");
        return;
      }
      rules = [{ shippingCompany: regionShipping, governorate, area: area || undefined }];
    }

    const res = await fetch("/api/cs/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "rules",
        ruleMode,
        rules,
        governorate: governorate || undefined,
        area: area || undefined,
      }),
    });
    const data = (await res.json()) as { message?: string; updated?: number };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر تطبيق القواعد.");
      return;
    }
    setMessage(`تم تطبيق القواعد على ${data.updated ?? 0} أوردر.`);
  }

  async function remove(id: number) {
    const res = await fetch(`/api/cs/assignments?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { message?: string };
      setMessage(data.message || "تعذر الحذف.");
      return;
    }
    await load();
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-xl px-3 py-2 text-sm font-extrabold ${
        tab === id ? "bg-[#FCA311] text-black" : "bg-[#E5E5E5] text-[#14213D]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/cs" className="text-sm font-bold text-[#14213D] underline">
            رجوع للقائمة
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold text-[#14213D]">توزيع الأوردرات على مسئولى خدمة العملاء</h1>
          <p className="text-sm text-[#14213D]/70">نطاق أرقام · تقسيم عادل · قواعد شحن/دفع/منطقة</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn("range", "نطاق أرقام")}
        {tabBtn("fair", "تقسيم عادل")}
        {tabBtn("rules", "قواعد")}
      </div>

      <div className="grid gap-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold text-[#14213D]">
          محافظة (اختياري للتقسيم/القواعد)
          <select
            value={governorate}
            onChange={(e) => {
              setGovernorate(e.target.value);
              setArea("");
            }}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2"
          >
            <option value="">كل المحافظات</option>
            {listCsGovernorates().map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold text-[#14213D]">
          منطقة
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={!governorate}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2 disabled:opacity-50"
          >
            <option value="">كل المناطق</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tab === "range" ? (
        <form
          onSubmit={onRangeSubmit}
          className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10 sm:grid-cols-4"
        >
          <label className="grid gap-1 text-sm font-bold">
            مسؤول خدمة العملاء
            <select name="agentId" required className="rounded-xl border border-[#E5E5E5] px-3 py-2">
              <option value="">اختاري...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            من رقم أوردر
            <input name="from" type="number" required className="rounded-xl border border-[#E5E5E5] px-3 py-2" dir="ltr" />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            إلى رقم أوردر
            <input name="to" type="number" required className="rounded-xl border border-[#E5E5E5] px-3 py-2" dir="ltr" />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="self-end rounded-xl bg-[#FCA311] px-4 py-2.5 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جاري الحفظ..." : "حفظ التوزيع"}
          </button>
        </form>
      ) : null}

      {tab === "fair" ? (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
          <p className="text-sm font-bold text-[#14213D]">
            اختاري 2–4 مسؤولين. التوزيع يقسم أرقام الأوردر الظاهرة إلى نطاقات متتالية غير متداخلة (مثلاً
            1150–1200 ثم 1201–1250)، وكل مسؤول يرى فقط نطاقه في قائمته. حالياً: {visibleOrderIds.length} أوردر
            (اليوم/أمس).
          </p>
          <div className="flex flex-wrap gap-2">
            {agents.map((a) => (
              <label
                key={a.id}
                className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-bold ring-1 ${
                  fairIds.includes(a.id) ? "bg-[#FCA311] text-black ring-[#FCA311]" : "bg-[#E5E5E5] ring-transparent"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={fairIds.includes(a.id)}
                  onChange={() => toggleFair(a.id)}
                />
                {a.name}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={loading || fairIds.length < 2}
            onClick={() => void runFair()}
            className="rounded-xl bg-[#14213D] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
          >
            نفّذ التقسيم العادل
          </button>
        </div>
      ) : null}

      {tab === "rules" ? (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
          <select
            value={ruleMode}
            onChange={(e) => setRuleMode(e.target.value as typeof ruleMode)}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm font-bold"
          >
            <option value="shipping">حسب شركة الشحن → مسؤول</option>
            <option value="paid">حسب مدفوع أونلاين → مسؤول</option>
            <option value="region_agent">منطقة → مسؤول</option>
            <option value="region_shipping">منطقة → شركة شحن (بوسطة / سيد تميمة)</option>
          </select>

          {ruleMode === "shipping" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold">
                بوسطة →
                <select
                  value={shipBostaAgent}
                  onChange={(e) => setShipBostaAgent(e.target.value)}
                  className="rounded-xl border border-[#E5E5E5] px-3 py-2"
                >
                  <option value="">—</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold">
                سيد تميمة →
                <select
                  value={shipTemimaAgent}
                  onChange={(e) => setShipTemimaAgent(e.target.value)}
                  className="rounded-xl border border-[#E5E5E5] px-3 py-2"
                >
                  <option value="">—</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {ruleMode === "paid" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold">
                مدفوع أونلاين →
                <select
                  value={paidAgent}
                  onChange={(e) => setPaidAgent(e.target.value)}
                  className="rounded-xl border border-[#E5E5E5] px-3 py-2"
                >
                  <option value="">—</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold">
                غير مدفوع →
                <select
                  value={unpaidAgent}
                  onChange={(e) => setUnpaidAgent(e.target.value)}
                  className="rounded-xl border border-[#E5E5E5] px-3 py-2"
                >
                  <option value="">—</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {ruleMode === "region_agent" ? (
            <label className="grid gap-1 text-sm font-bold">
              مسؤول المنطقة المحددة أعلاه
              <select
                value={regionAgentId}
                onChange={(e) => setRegionAgentId(e.target.value)}
                className="rounded-xl border border-[#E5E5E5] px-3 py-2"
              >
                <option value="">اختاري...</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {ruleMode === "region_shipping" ? (
            <label className="grid gap-1 text-sm font-bold">
              شركة الشحن للمنطقة المحددة
              <select
                value={regionShipping}
                onChange={(e) => setRegionShipping(e.target.value as "bosta" | "sayed_temima")}
                className="rounded-xl border border-[#E5E5E5] px-3 py-2"
              >
                <option value="sayed_temima">سيد تميمة</option>
                <option value="bosta">بوسطة</option>
              </select>
            </label>
          ) : null}

          <button
            type="button"
            disabled={loading}
            onClick={() => void runRules()}
            className="rounded-xl bg-[#FCA311] px-4 py-2.5 text-sm font-extrabold text-black disabled:opacity-60"
          >
            تطبيق القواعد
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full text-sm">
          <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
            <tr>
              <th className="px-3 py-2">مسؤول خدمة العملاء</th>
              <th className="px-3 py-2">من</th>
              <th className="px-3 py-2">إلى</th>
              <th className="px-3 py-2">التاريخ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[#14213D]/60">
                  لا توجد توزيعات نطاق بعد.
                </td>
              </tr>
            ) : (
              assignments.map((row) => (
                <tr key={row.id} className="border-t border-[#E5E5E5]">
                  <td className="px-3 py-2 font-bold">{row.agentName}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {row.wooOrderNumberFrom}
                  </td>
                  <td className="px-3 py-2" dir="ltr">
                    {row.wooOrderNumberTo}
                  </td>
                  <td className="px-3 py-2 text-xs text-[#14213D]/60">
                    {new Date(row.createdAt).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      className="rounded-lg bg-black px-2 py-1 text-xs font-bold text-white"
                    >
                      حذف
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
