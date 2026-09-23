"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  cairoTodayYmd,
  cairoYmdFromIso,
  eachCairoYmdInclusive,
  formatCairoOrderDate,
} from "@/lib/cs/order-window";

type Agent = { id: number; name: string; email?: string };
type Assignment = {
  id: number;
  agentId: number;
  agentName: string;
  wooOrderNumberFrom: number;
  wooOrderNumberTo: number;
  createdAt: string;
  countEstimate?: number;
};

type PendingOrder = { id: number; wooOrderNumber: string; orderNum: number };

type Tab = "range" | "fair" | "rules";

const FILTER_CONTROL =
  "h-9 w-full rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2.5 text-xs font-bold text-[#14213D] outline-none focus:border-[#FCA311]";

export function CsAssignClient({
  agents,
  visibleOrderIds = [],
}: {
  agents: Agent[];
  visibleOrderIds?: number[];
}) {
  const today = cairoTodayYmd();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("range");
  const [fairIds, setFairIds] = useState<number[]>([]);
  const [ruleMode, setRuleMode] = useState<"shipping" | "paid">("shipping");
  const [shipBostaAgent, setShipBostaAgent] = useState("");
  const [shipTemimaAgent, setShipTemimaAgent] = useState("");
  const [paidAgent, setPaidAgent] = useState("");
  const [unpaidAgent, setUnpaidAgent] = useState("");

  const [draftFrom, setDraftFrom] = useState(today);
  const [draftTo, setDraftTo] = useState(today);
  const [appliedFrom, setAppliedFrom] = useState(today);
  const [appliedTo, setAppliedTo] = useState(today);

  const [showPendingAfterLast, setShowPendingAfterLast] = useState(false);
  const [pendingLastTo, setPendingLastTo] = useState(0);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const loadAssignments = useCallback(async (fromYmd: string, toYmd: string) => {
    const qs = new URLSearchParams({ from: fromYmd, to: toYmd });
    const res = await fetch(`/api/cs/assignments?${qs}`);
    const data = (await res.json()) as { assignments?: Assignment[]; message?: string };
    if (res.ok) setAssignments(data.assignments || []);
    else setMessage(data.message || "تعذر التحميل.");
  }, []);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    const res = await fetch("/api/cs/assignments?pendingAfterLast=1");
    const data = (await res.json()) as {
      lastTo?: number;
      pending?: PendingOrder[];
      message?: string;
    };
    setPendingLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر تحميل الأوردرات بعد آخر توزيع.");
      return;
    }
    setPendingLastTo(data.lastTo ?? 0);
    setPendingOrders(data.pending || []);
  }, []);

  useEffect(() => {
    void loadAssignments(appliedFrom, appliedTo);
  }, [appliedFrom, appliedTo, loadAssignments]);

  useEffect(() => {
    if (showPendingAfterLast) void loadPending();
    else {
      setPendingOrders([]);
      setPendingLastTo(0);
    }
  }, [showPendingAfterLast, loadPending]);

  const dayGroups = useMemo(() => {
    const days = eachCairoYmdInclusive(appliedFrom, appliedTo);
    const byDay = new Map<string, Assignment[]>();
    for (const day of days) byDay.set(day, []);
    for (const row of assignments) {
      const day = cairoYmdFromIso(row.createdAt);
      if (!byDay.has(day)) continue;
      byDay.get(day)!.push(row);
    }
    return days.map((day) => ({
      day,
      rows: (byDay.get(day) || []).slice().sort((a, b) => a.agentName.localeCompare(b.agentName, "ar")),
    }));
  }, [assignments, appliedFrom, appliedTo]);

  const fairConfirmationIds = showPendingAfterLast
    ? pendingOrders.map((p) => p.id)
    : visibleOrderIds;

  function toggleFair(id: number) {
    setFairIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function applyDateFilter() {
    const from = draftFrom || today;
    const to = draftTo || today;
    if (from > to) {
      setMessage("تاريخ «من» يجب أن يكون قبل أو يساوي «إلى».");
      return;
    }
    setAppliedFrom(from);
    setAppliedTo(to);
    setMessage("");
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
    await loadAssignments(appliedFrom, appliedTo);
    if (showPendingAfterLast) await loadPending();
  }

  async function runFair() {
    setLoading(true);
    setMessage("");
    if (fairConfirmationIds.length === 0) {
      setLoading(false);
      setMessage(
        showPendingAfterLast
          ? "لا توجد أوردرات بعد آخر توزيع للتوزيع العادل."
          : "لا توجد أوردرات ظاهرة في القائمة (اليوم/أمس). زامني من قائمة الانتظار أولاً أو فعّلي تشيك بعد آخر توزيع.",
      );
      return;
    }
    const res = await fetch("/api/cs/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "fair",
        agentIds: fairIds,
        confirmationIds: fairConfirmationIds,
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
    setAppliedFrom(today);
    setAppliedTo(today);
    setDraftFrom(today);
    setDraftTo(today);
    await loadAssignments(today, today);
    if (showPendingAfterLast) await loadPending();
  }

  async function runRules() {
    setLoading(true);
    setMessage("");
    const rules: Array<{
      agentId?: number;
      shippingCompany?: "bosta" | "sayed_temima";
      paidOnline?: boolean;
    }> = [];

    if (ruleMode === "shipping") {
      if (shipBostaAgent) rules.push({ agentId: Number(shipBostaAgent), shippingCompany: "bosta" });
      if (shipTemimaAgent) {
        rules.push({ agentId: Number(shipTemimaAgent), shippingCompany: "sayed_temima" });
      }
    } else {
      if (paidAgent) rules.push({ agentId: Number(paidAgent), paidOnline: true });
      if (unpaidAgent) rules.push({ agentId: Number(unpaidAgent), paidOnline: false });
    }

    const res = await fetch("/api/cs/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "rules", ruleMode, rules }),
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
    await loadAssignments(appliedFrom, appliedTo);
    if (showPendingAfterLast) await loadPending();
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

  const pendingPreview = pendingOrders.slice(0, 12);
  const pendingMin = pendingOrders[0]?.orderNum;
  const pendingMax = pendingOrders[pendingOrders.length - 1]?.orderNum;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/cs" className="text-sm font-bold text-[#14213D] underline">
            رجوع للقائمة
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold text-[#14213D]">توزيع الأوردرات على مسئولى خدمة العملاء</h1>
          <p className="text-sm text-[#14213D]/70">نطاق أرقام · تقسيم عادل · قواعد شحن/دفع · مراجعة يوم التوزيع</p>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-3 shadow ring-1 ring-[#14213D]/10">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className={`${FILTER_CONTROL} flex items-center gap-1.5`}>
            <span className="shrink-0 text-[#14213D]/60">من</span>
            <input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
            />
          </div>
          <div className={`${FILTER_CONTROL} flex items-center gap-1.5`}>
            <span className="shrink-0 text-[#14213D]/60">إلى</span>
            <input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-bold text-[#14213D] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={applyDateFilter}
            className="h-9 rounded-lg bg-[#FCA311] px-3 text-xs font-extrabold text-black sm:col-span-2"
          >
            فلتر أيام التوزيع
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[#14213D]">
          <input
            type="checkbox"
            className="size-4 accent-[#FCA311]"
            checked={showPendingAfterLast}
            onChange={(e) => setShowPendingAfterLast(e.target.checked)}
          />
          إظهار الأوردرات المطلوب توزيعها بعد آخر توزيع
        </label>
      </div>

      {showPendingAfterLast ? (
        <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
          <p className="text-sm font-extrabold text-[#14213D]">
            أوردرات بعد آخر توزيع
            {pendingLoading ? " — جاري التحميل..." : ` — ${pendingOrders.length} أوردر`}
          </p>
          <p className="mt-1 text-xs font-bold text-[#14213D]/70">
            حد آخر توزيع سابق: {pendingLastTo || "لا يوجد"} · يظهر فقط غير الموزّع برقم أكبر من الحد
            {pendingMin != null && pendingMax != null ? (
              <>
                {" "}
                · النطاق الظاهر: <span dir="ltr">{pendingMin}→{pendingMax}</span>
              </>
            ) : null}
          </p>
          {pendingOrders.length === 0 && !pendingLoading ? (
            <p className="mt-3 text-sm font-bold text-[#14213D]/60">لا توجد أوردرات بانتظار التوزيع بعد آخر توزيع.</p>
          ) : (
            <p className="mt-3 text-xs font-bold text-[#14213D]/80" dir="ltr">
              {pendingPreview.map((p) => p.wooOrderNumber).join(" · ")}
              {pendingOrders.length > pendingPreview.length ? " · …" : ""}
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabBtn("range", "نطاق أرقام")}
        {tabBtn("fair", "تقسيم عادل")}
        {tabBtn("rules", "قواعد")}
      </div>

      {tab === "range" ? (
        <form
          onSubmit={onRangeSubmit}
          className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10 sm:grid-cols-4"
        >
          <label className="grid gap-1 text-sm font-bold">
            مسؤول خدمة العملاء
            <select name="agentId" required className={FILTER_CONTROL}>
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
            <input name="from" type="number" required className={FILTER_CONTROL} dir="ltr" />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            إلى رقم أوردر
            <input name="to" type="number" required className={FILTER_CONTROL} dir="ltr" />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="self-end h-9 rounded-lg bg-[#FCA311] px-4 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جاري الحفظ..." : "حفظ التوزيع"}
          </button>
        </form>
      ) : null}

      {tab === "fair" ? (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
          <p className="text-sm font-bold text-[#14213D]">
            اختاري 2–4 مسؤولين. التوزيع يقسم أرقام الأوردر إلى نطاقات متتالية غير متداخلة. حالياً:{" "}
            {fairConfirmationIds.length} أوردر
            {showPendingAfterLast ? " (بعد آخر توزيع)" : " (اليوم/أمس من القائمة)"}.
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
            onChange={(e) => setRuleMode(e.target.value as "shipping" | "paid")}
            className={FILTER_CONTROL}
          >
            <option value="shipping">حسب شركة الشحن → مسؤول</option>
            <option value="paid">حسب مدفوع أونلاين → مسؤول</option>
          </select>

          {ruleMode === "shipping" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold">
                بوسطة →
                <select
                  value={shipBostaAgent}
                  onChange={(e) => setShipBostaAgent(e.target.value)}
                  className={FILTER_CONTROL}
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
                  className={FILTER_CONTROL}
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
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold">
                مدفوع أونلاين →
                <select value={paidAgent} onChange={(e) => setPaidAgent(e.target.value)} className={FILTER_CONTROL}>
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
                  className={FILTER_CONTROL}
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
          )}

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

      <div className="space-y-3">
        <h2 className="text-lg font-extrabold text-[#14213D]">
          توزيعات حسب اليوم
          {appliedFrom === appliedTo ? (
            <span className="mr-2 text-sm font-bold text-[#14213D]/60">({formatCairoOrderDate(`${appliedFrom}T12:00:00+02:00`)})</span>
          ) : (
            <span className="mr-2 text-sm font-bold text-[#14213D]/60" dir="ltr">
              ({appliedFrom} → {appliedTo})
            </span>
          )}
        </h2>

        {dayGroups.map(({ day, rows }) => (
          <div key={day} className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
            <div className="flex items-center justify-between gap-2 bg-[#E5E5E5] px-3 py-2">
              <p className="text-sm font-extrabold text-[#14213D]">{formatCairoOrderDate(`${day}T12:00:00+02:00`)}</p>
              <p className="text-xs font-bold text-[#14213D]/70">{rows.length} توزيعة</p>
            </div>
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm font-bold text-[#14213D]/60">
                لا توجد أوردرات موزّعة في هذا اليوم.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-white text-right text-[#14213D]/70">
                    <tr>
                      <th className="px-3 py-2 font-bold">موظف خدمة العملاء</th>
                      <th className="px-3 py-2 font-bold">من</th>
                      <th className="px-3 py-2 font-bold">إلى</th>
                      <th className="px-3 py-2 font-bold">تقريبي</th>
                      <th className="px-3 py-2 font-bold">وقت التوزيع</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-[#E5E5E5]">
                        <td className="px-3 py-2 font-extrabold">{row.agentName}</td>
                        <td className="px-3 py-2" dir="ltr">
                          {row.wooOrderNumberFrom}
                        </td>
                        <td className="px-3 py-2" dir="ltr">
                          {row.wooOrderNumberTo}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.countEstimate ??
                            Math.max(0, Math.abs(row.wooOrderNumberTo - row.wooOrderNumberFrom) + 1)}
                        </td>
                        <td className="px-3 py-2 text-xs text-[#14213D]/60">
                          {new Date(row.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
