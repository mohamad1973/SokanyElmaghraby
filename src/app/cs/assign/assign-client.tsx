"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Agent = { id: number; name: string; email?: string };
type Assignment = {
  id: number;
  agentId: number;
  agentName: string;
  wooOrderNumberFrom: number;
  wooOrderNumberTo: number;
  createdAt: string;
};

export function CsAssignClient({ agents }: { agents: Agent[] }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/cs/assignments");
    const data = (await res.json()) as { assignments?: Assignment[]; message?: string };
    if (res.ok) setAssignments(data.assignments || []);
    else setMessage(data.message || "تعذر التحميل.");
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/cs/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    setMessage("تم حفظ التوزيع.");
    event.currentTarget.reset();
    await load();
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

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/cs" className="text-sm font-bold text-teal-700 underline">
            رجوع للقائمة
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold">توزيع الأوردرات على الوكيلات</h1>
          <p className="text-sm text-slate-600">منى عباس: من رقم أوردر → إلى رقم أوردر لوكيلة محددة.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-teal-100 sm:grid-cols-4">
        <label className="grid gap-1 text-sm font-bold">
          الوكيلة
          <select name="agentId" required className="rounded-xl border px-3 py-2">
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
          <input name="from" type="number" required className="rounded-xl border px-3 py-2" dir="ltr" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          إلى رقم أوردر
          <input name="to" type="number" required className="rounded-xl border px-3 py-2" dir="ltr" />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="self-end rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {loading ? "جاري الحفظ..." : "حفظ التوزيع"}
        </button>
      </form>

      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{message}</p> : null}

      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-teal-100">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-right">
            <tr>
              <th className="px-3 py-2">الوكيلة</th>
              <th className="px-3 py-2">من</th>
              <th className="px-3 py-2">إلى</th>
              <th className="px-3 py-2">التاريخ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  لا توجد توزيعات بعد.
                </td>
              </tr>
            ) : (
              assignments.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-bold">{row.agentName}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {row.wooOrderNumberFrom}
                  </td>
                  <td className="px-3 py-2" dir="ltr">
                    {row.wooOrderNumberTo}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {new Date(row.createdAt).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-bold text-white"
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
