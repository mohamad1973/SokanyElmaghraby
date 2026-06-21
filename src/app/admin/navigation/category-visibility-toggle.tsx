"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CategoryVisibilityToggleProps = {
  categoryId: number;
  slug: string;
  isVisibleOnFrontend: boolean;
  disabled?: boolean;
};

export function CategoryVisibilityToggle({
  categoryId,
  slug,
  isVisibleOnFrontend,
  disabled = false,
}: CategoryVisibilityToggleProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function updateVisibility() {
    setIsSaving(true);
    setError("");

    const response = await fetch(`/api/admin/category-visibility/${categoryId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug,
        isVisibleOnFrontend: !isVisibleOnFrontend,
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message || "تعذر حفظ حالة الظهور.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled || isSaving}
        onClick={updateVisibility}
        className={`rounded-full px-3 py-1 text-xs font-bold transition ${
          isVisibleOnFrontend
            ? "bg-red-50 text-red-700 hover:bg-red-100"
            : "bg-brand-gold text-black hover:bg-brand-gold-dark"
        } disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400`}
      >
        {isSaving
          ? "جار الحفظ..."
          : isVisibleOnFrontend
            ? "إخفاء من الفرونت اند"
            : "إظهار في الفرونت اند"}
      </button>
      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          isVisibleOnFrontend ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
        }`}
      >
        {isVisibleOnFrontend ? "ظاهرة في الفرونت اند" : "مخفية من الفرونت اند"}
      </span>
      {error ? <span className="text-xs font-semibold text-red-600">{error}</span> : null}
    </div>
  );
}
