"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type AreaItem = {
  id: number;
  name: string;
};

type DistrictItem = {
  id: number;
  name: string;
  governorate: string;
  children: AreaItem[];
};

export function DistrictCard({ district }: { district: DistrictItem }) {
  const router = useRouter();
  const [areaName, setAreaName] = useState("");
  const [loading, setLoading] = useState<"delete" | "area" | null>(null);
  const [message, setMessage] = useState("");

  async function deleteRecord(id: number, label: string) {
    if (!confirm(`هل تريد حذف ${label}؟`)) {
      return;
    }

    setLoading("delete");
    setMessage("");

    const response = await fetch("/api/admin/dispatch/zones", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const data = await response.json();
    setLoading(null);
    setMessage(data.message || (response.ok ? "تم الحذف." : "تعذر الحذف."));
    router.refresh();
  }

  async function addArea(event: FormEvent) {
    event.preventDefault();
    if (!areaName.trim()) {
      return;
    }

    setLoading("area");
    setMessage("");

    const response = await fetch("/api/admin/dispatch/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: areaName, parentId: district.id }),
    });

    const data = await response.json();
    setLoading(null);
    setMessage(data.message || (response.ok ? "تمت إضافة المنطقة." : "تعذر الإضافة."));
    if (response.ok) {
      setAreaName("");
    }
    router.refresh();
  }

  return (
    <div className="rounded border border-zinc-200 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-zinc-500">حي</p>
          <p className="font-bold">{district.name}</p>
          <p className="text-zinc-600">{district.governorate}</p>
        </div>
        <button
          type="button"
          disabled={loading === "delete"}
          onClick={() => void deleteRecord(district.id, `حي ${district.name}`)}
          className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700 disabled:opacity-60"
        >
          حذف الحي
        </button>
      </div>

      {district.children.length > 0 ? (
        <ul className="mt-3 space-y-2 border-r-2 border-zinc-200 pr-3">
          {district.children.map((area) => (
            <li key={area.id} className="flex items-center justify-between gap-2">
              <span>
                <span className="text-xs text-zinc-500">منطقة — </span>
                {area.name}
              </span>
              <button
                type="button"
                disabled={loading === "delete"}
                onClick={() => void deleteRecord(area.id, `منطقة ${area.name}`)}
                className="rounded border border-red-200 px-2 py-1 text-xs font-bold text-red-600"
              >
                حذف
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">لا توجد مناطق فرعية بعد.</p>
      )}

      <form onSubmit={addArea} className="mt-3 flex flex-wrap gap-2">
        <input
          value={areaName}
          onChange={(event) => setAreaName(event.target.value)}
          placeholder="اسم المنطقة داخل الحي"
          className="min-w-48 flex-1 rounded border px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={loading === "area"}
          className="rounded bg-zinc-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-60"
        >
          {loading === "area" ? "..." : "+ إضافة منطقة"}
        </button>
      </form>

      {message ? <p className="mt-2 text-xs text-zinc-600">{message}</p> : null}
    </div>
  );
}
