"use client";

import { useCallback, useEffect, useState } from "react";

type AgentRow = {
  id: number;
  name: string;
  username: string;
  role: string;
  roles?: string[];
  phone?: string | null;
  isActive: boolean;
  createdAt?: string;
};

const PERMISSIONS = [
  { id: "agent", label: "خدمة عملاء" },
  { id: "supervisor", label: "مشرف توزيع" },
  { id: "transfers", label: "التحويلات" },
  { id: "shipping", label: "شحن تميمة" },
  { id: "accounting", label: "حسابات" },
  { id: "admin", label: "أدمن" },
] as const;

function RoleChecks({
  value,
  disabled,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const allOn = PERMISSIONS.every((item) => value.includes(item.id));
  function toggle(id: string) {
    const next = value.includes(id) ? value.filter((role) => role !== id) : [...value, id];
    onChange(next);
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          className="size-3.5"
          checked={allOn}
          disabled={disabled}
          onChange={() => onChange(allOn ? [] : PERMISSIONS.map((item) => item.id))}
        />
        كل الصلاحيات
      </label>
      {PERMISSIONS.map((item) => (
        <label key={item.id} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="size-3.5"
            checked={value.includes(item.id)}
            disabled={disabled}
            onChange={() => toggle(item.id)}
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}

export function CsUsersClient() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    roles: ["agent"] as string[],
    phone: "",
  });

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
    if (!form.roles.length) {
      setMessage("اختر صلاحية واحدة على الأقل.");
      return;
    }
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
    setForm({ name: "", username: "", password: "", roles: ["agent"], phone: "" });
    setMessage("تم إنشاء المستخدم.");
    await load();
  }

  async function patch(
    id: number,
    patchBody: Partial<{ roles: string[]; isActive: boolean; password: string; phone: string }>,
  ) {
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/cs/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patchBody }),
    });
    const data = (await res.json()) as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر التحديث.");
      return;
    }
    setMessage("تم التحديث. الموظف يحتاج تسجيل دخول من جديد.");
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
        <p className="mt-1 text-sm font-bold text-[#14213D]/70">
          يمكنك إنشاء أدمن CS إضافي (مثل mm). دور التحويلات يحتاج رقم واتساب للتنبيهات. حساب mm محمي.
        </p>
      </div>

      {message ? (
        <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p>
      ) : null}

      <form
        onSubmit={createUser}
        className="space-y-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10"
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid min-w-0 gap-1 text-xs font-bold">
            الاسم
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              minLength={2}
              className="h-9 min-w-0 rounded-lg border border-[#E5E5E5] px-2 text-sm"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-bold">
            اليوزرنيم
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              required
              minLength={2}
              dir="ltr"
              className="h-9 min-w-0 rounded-lg border border-[#E5E5E5] px-2 text-sm"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-bold">
            باسورد
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={6}
              className="h-9 min-w-0 rounded-lg border border-[#E5E5E5] px-2 text-sm"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-bold">
            واتساب
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="01xxxxxxxxx"
              dir="ltr"
              className="h-9 min-w-0 rounded-lg border border-[#E5E5E5] px-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="h-9 self-end rounded-lg bg-[#FCA311] px-3 text-sm font-extrabold text-black disabled:opacity-60"
          >
            إضافة
          </button>
        </div>
        <div className="grid gap-1 text-xs font-bold">
          الصلاحيات
          <RoleChecks value={form.roles} onChange={(roles) => setForm((f) => ({ ...f, roles }))} />
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full text-sm">
          <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
            <tr>
              <th className="px-3 py-2">الاسم</th>
              <th className="px-3 py-2">اليوزرنيم</th>
              <th className="px-3 py-2">الصلاحيات</th>
              <th className="px-3 py-2">واتساب</th>
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
                    <span className="font-bold">كل الصلاحيات</span>
                  ) : (
                    <RoleChecks
                      value={a.roles?.length ? a.roles : [a.role]}
                      disabled={loading}
                      onChange={(roles) => {
                        if (!roles.length) {
                          setMessage("اختر صلاحية واحدة على الأقل.");
                          return;
                        }
                        void patch(a.id, { roles });
                      }}
                    />
                  )}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {a.username === "mm" ? (
                    "—"
                  ) : (
                    <input
                      defaultValue={a.phone || ""}
                      disabled={loading}
                      placeholder="01…"
                      className="w-28 rounded-lg border border-[#E5E5E5] px-2 py-1 text-xs"
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next !== (a.phone || "")) void patch(a.id, { phone: next });
                      }}
                    />
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
