"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CategoryMenuActionsProps = {
  categoryId: number;
  slug: string;
  isTrashed: boolean;
  disabled?: boolean;
};

export function CategoryMenuActions({
  categoryId,
  slug,
  isTrashed,
  disabled = false,
}: CategoryMenuActionsProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function updateTrashState(nextIsTrashed: boolean) {
    setIsSaving(true);
    setError("");

    const response = await fetch(`/api/admin/navigation-settings/${categoryId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug,
        isTrashed: nextIsTrashed,
        isVisible: !nextIsTrashed,
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message || "تعذر حفظ حالة الكاتيجوري.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled || isSaving}
        onClick={() => updateTrashState(!isTrashed)}
        className={`rounded-full px-3 py-1 text-xs font-bold transition ${
          isTrashed
            ? "bg-brand-gold text-black hover:bg-brand-gold-dark"
            : "bg-red-50 text-red-700 hover:bg-red-100"
        } disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400`}
      >
        {isSaving ? "جار الحفظ..." : isTrashed ? "استرجاع" : "نقل إلى الترش"}
      </button>
      {error ? <span className="text-xs font-semibold text-red-600">{error}</span> : null}
    </div>
  );
}
