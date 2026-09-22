"use client";

import { useCallback, useEffect, useState } from "react";

type AgentRow = {
  id: number;
  name: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt?: string;
};

const ROLE_LABEL: Record<string, string> = {
  agent: "خدمة عملاء عادي",
  supervisor: "مشرف توزيع",
  admin: "أدمن",
};

export function CsUsersClient() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "agent" });

  const load = useCallback(async () => {
    const res = await fetch("/api/cs/agents");
    const data = (await res.json()) as { agents?: AgentRow[]; message?: string };
    if (!res.ok) {
      setMessage(data.message || "تعذر التحميل.");
      return;
    }
    setAgents(data.agents || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/cs/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json()) as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر الإنشاء.");
      return;
    }
    setForm({ name: "", username: "", password: "", role: "agent" });
    setMessage("تم إنشاء المستخدم.");
    await load();
  }

  async function patch(id: number, patch: Partial<{ role: string; isActive: boolean; password: string }>) {
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/cs/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = (await res.json()) as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر التحديث.");
      return;
    }
    setMessage("تم التحديث.");
    await load();
  }

  async function remove(id: number) {
    if (!window.confirm("حذف هذا المستخدم؟")) return;
    setLoading(true);
    const res = await fetch(`/api/cs/agents?id=${id}`, { method: "DELETE" });
    const data = (await res.json()) as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر الحذف.");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
        <h1 className="text-2xl font-extrabold text-[#14213D]">إدارة مستخدمي خدمة العملاء</h1>
        <p className="mt-1 text-sm font-bold text-[#14213D]/70">أنت وحدك كأدمن تستطيع تغيير الصلاحيات.</p>
      </div>

      {message ? (
        <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p>
      ) : null}

      <form onSubmit={createUser} className="grid gap-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-sm font-bold">
          الاسم
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            minLength={2}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          اليوزرنيم
          <input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
            minLength={2}
            dir="ltr"
            className="rounded-xl border border-[#E5E5E5] px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          باسورد
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
            minLength={6}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          الدور
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="rounded-xl border border-[#E5E5E5] px-3 py-2"
          >
            <option value="agent">خدمة عملاء عادي</option>
            <option value="supervisor">مشرف توزيع</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="self-end rounded-xl bg-[#FCA311] px-4 py-2.5 text-sm font-extrabold text-black disabled:opacity-60"
        >
          إضافة
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full text-sm">
          <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
            <tr>
              <th className="px-3 py-2">الاسم</th>
              <th className="px-3 py-2">اليوزرنيم</th>
              <th className="px-3 py-2">الدور</th>
              <th className="px-3 py-2">الحالة</th>
              <th className="px-3 py-2">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-t border-[#E5E5E5]">
                <td className="px-3 py-2 font-bold">{a.name}</td>
                <td className="px-3 py-2" dir="ltr">
                  {a.username}
                </td>
                <td className="px-3 py-2">
                  {a.username === "mm" ? (
                    <span className="font-bold">{ROLE_LABEL.admin}</span>
                  ) : (
                    <select
                      value={a.role === "admin" ? "admin" : a.role}
                      disabled={loading || a.username === "mm"}
                      onChange={(e) => void patch(a.id, { role: e.target.value })}
                      className="rounded-lg border border-[#E5E5E5] px-2 py-1"
                    >
                      <option value="agent">خدمة عملاء عادي</option>
                      <option value="supervisor">مشرف توزيع</option>
                      {a.role === "admin" ? <option value="admin">أدمن</option> : null}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2">{a.isActive ? "نشط" : "معطّل"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {a.username !== "mm" ? (
                      <>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void patch(a.id, { isActive: !a.isActive })}
                          className="rounded-lg bg-[#E5E5E5] px-2 py-1 text-xs font-bold"
                        >
                          {a.isActive ? "تعطيل" : "تفعيل"}
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            const password = window.prompt("باسورد جديد (6 أحرف على الأقل):");
                            if (password && password.length >= 6) void patch(a.id, { password });
                          }}
                          className="rounded-lg bg-[#14213D] px-2 py-1 text-xs font-bold text-white"
                        >
                          باسورد
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void remove(a.id)}
                          className="rounded-lg bg-black px-2 py-1 text-xs font-bold text-white"
                        >
                          حذف
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-[#14213D]/50">محمي</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
