"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CategoryMenuToggleProps = {
  categoryId: number;
  slug: string;
  showInMenu: boolean;
  disabled?: boolean;
};

export function CategoryMenuToggle({
  categoryId,
  slug,
  showInMenu,
  disabled = false,
}: CategoryMenuToggleProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function updateMenuSelection() {
    setIsSaving(true);
    setError("");

    const response = await fetch(`/api/admin/category-menu-selection/${categoryId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug,
        showInMenu: !showInMenu,
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message || "تعذر حفظ حالة المنيو.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled || isSaving}
        onClick={updateMenuSelection}
        className={`rounded-full px-3 py-1 text-xs font-bold transition ${
          showInMenu
            ? "bg-red-50 text-red-700 hover:bg-red-100"
            : "bg-brand-gold text-black hover:bg-brand-gold-dark"
        } disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400`}
      >
        {isSaving ? "جار الحفظ..." : showInMenu ? "إزالة من المنيو" : "إضافة إلى المنيو"}
      </button>
      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          showInMenu ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
        }`}
      >
        {showInMenu ? "موجودة في المنيو" : "غير موجودة في المنيو"}
      </span>
      {error ? <span className="text-xs font-semibold text-red-600">{error}</span> : null}
    </div>
  );
}
