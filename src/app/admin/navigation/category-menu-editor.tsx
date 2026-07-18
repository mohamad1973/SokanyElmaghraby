"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CategoryMenuSelectionNode } from "@/lib/types";

export const PRESET_CATEGORY_ICONS = [
  { key: "blender", label: "خلاط", url: "/category-icons/blender.svg" },
  { key: "air-fryer", label: "قلاية", url: "/category-icons/air-fryer.svg" },
  { key: "mixer", label: "عجان", url: "/category-icons/mixer.svg" },
  { key: "hand-mixer", label: "مضرب", url: "/category-icons/hand-mixer.svg" },
  { key: "hand-blender", label: "هاند بلندر", url: "/category-icons/hand-blender.svg" },
  { key: "coffee", label: "قهوة", url: "/category-icons/coffee.svg" },
  { key: "grinder", label: "مطحنة", url: "/category-icons/grinder.svg" },
  { key: "kettle", label: "غلاية", url: "/category-icons/kettle.svg" },
  { key: "sandwich", label: "ساندوتش", url: "/category-icons/sandwich.svg" },
  { key: "microwave", label: "ميكروويف", url: "/category-icons/microwave.svg" },
  { key: "heater", label: "سخان", url: "/category-icons/heater.svg" },
  { key: "juicer", label: "عصارة", url: "/category-icons/juicer.svg" },
  { key: "meat-grinder", label: "مفرمة", url: "/category-icons/meat-grinder.svg" },
  { key: "pressure-cooker", label: "ضغط", url: "/category-icons/pressure-cooker.svg" },
  { key: "chopper", label: "كبة", url: "/category-icons/chopper.svg" },
  { key: "frother", label: "نسكافيه", url: "/category-icons/frother.svg" },
] as const;

type CategoryMenuEditorProps = {
  category: CategoryMenuSelectionNode;
  allCategories: CategoryMenuSelectionNode[];
  disabled?: boolean;
};

export function CategoryMenuEditor({ category, allCategories, disabled = false }: CategoryMenuEditorProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [parentOverride, setParentOverride] = useState<string>(
    category.parentOverride === null ? "woo" : String(category.parentOverride),
  );

  const parentOptions = allCategories.filter((item) => item.id !== category.id);

  async function patch(body: Record<string, unknown>) {
    setIsSaving(true);
    setError("");

    const response = await fetch(`/api/admin/category-menu-selection/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message || "تعذر حفظ إعدادات التصنيف.");
      return false;
    }

    router.refresh();
    return true;
  }

  async function toggleShowInMenu() {
    await patch({
      slug: category.slug,
      showInMenu: !category.showInMenu,
      parentOverride: category.parentOverride,
      sortOrder: category.sortOrder,
      iconUrl: category.iconUrl || null,
    });
  }

  async function saveParent() {
    const nextParent =
      parentOverride === "woo" ? null : parentOverride === "0" ? 0 : Number(parentOverride);

    await patch({
      slug: category.slug,
      showInMenu: category.showInMenu,
      parentOverride: nextParent,
      sortOrder: category.sortOrder,
      iconUrl: category.iconUrl || null,
    });
  }

  async function move(direction: "up" | "down") {
    await patch({ move: direction });
  }

  async function setIcon(url: string | null, clear = false) {
    await patch({
      slug: category.slug,
      showInMenu: category.showInMenu,
      parentOverride: category.parentOverride,
      sortOrder: category.sortOrder,
      iconUrl: url,
      clearIcon: clear,
    });
  }

  async function uploadIcon(file: File | null) {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    formData.set("purpose", "category-icon");

    setIsSaving(true);
    setError("");

    const response = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
    setIsSaving(false);

    if (!response.ok || !payload?.url) {
      setError(payload?.message || "تعذر رفع الأيقونة.");
      return;
    }

    await setIcon(payload.url);
  }

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-black/5 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || isSaving}
          onClick={toggleShowInMenu}
          className={`rounded-full px-3 py-1 text-xs font-bold transition ${
            category.showInMenu
              ? "bg-red-50 text-red-700 hover:bg-red-100"
              : "bg-brand-gold text-black hover:bg-brand-gold-dark"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {isSaving ? "جار الحفظ..." : category.showInMenu ? "حذف من المنيو" : "إضافة إلى المنيو"}
        </button>
        <button
          type="button"
          disabled={disabled || isSaving}
          onClick={() => move("up")}
          className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-800 ring-1 ring-black/10 disabled:opacity-50"
        >
          أعلى ↑
        </button>
        <button
          type="button"
          disabled={disabled || isSaving}
          onClick={() => move("down")}
          className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-800 ring-1 ring-black/10 disabled:opacity-50"
        >
          أسفل ↓
        </button>
        <span className="text-xs text-zinc-500">ترتيب: {category.sortOrder}</span>
      </div>

      <label className="grid gap-1 text-xs font-bold text-zinc-700">
        التصنيف الأب (منيو المتجر)
        <div className="flex flex-wrap gap-2">
          <select
            value={parentOverride}
            disabled={disabled || isSaving}
            onChange={(event) => setParentOverride(event.target.value)}
            className="min-w-[220px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          >
            <option value="woo">حسب ووكومرس (افتراضي)</option>
            <option value="0">بدون أب (رئيسي)</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || isSaving}
            onClick={saveParent}
            className="rounded-full bg-black px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            حفظ الأب
          </button>
        </div>
      </label>

      <div className="grid gap-2">
        <p className="text-xs font-bold text-zinc-700">أيقونة المنيو</p>
        <div className="flex flex-wrap items-center gap-2">
          {category.iconUrl ? (
            <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 ring-black/10">
              <Image src={category.iconUrl} alt="" width={28} height={28} unoptimized />
            </span>
          ) : (
            <span className="text-xs text-zinc-500">لا توجد أيقونة</span>
          )}
          <label className="cursor-pointer rounded-full bg-white px-3 py-1 text-xs font-bold ring-1 ring-black/10">
            رفع أيقونة
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              disabled={disabled || isSaving}
              onChange={(event) => uploadIcon(event.target.files?.[0] || null)}
            />
          </label>
          {category.iconUrl ? (
            <button
              type="button"
              disabled={disabled || isSaving}
              onClick={() => setIcon(null, true)}
              className="text-xs font-bold text-red-600"
            >
              إزالة
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESET_CATEGORY_ICONS.map((icon) => (
            <button
              key={icon.key}
              type="button"
              title={icon.label}
              disabled={disabled || isSaving}
              onClick={() => setIcon(icon.url)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 transition hover:ring-brand-gold disabled:opacity-50 ${
                category.iconUrl === icon.url ? "ring-2 ring-brand-gold" : "ring-black/10"
              }`}
            >
              <Image src={icon.url} alt={icon.label} width={24} height={24} unoptimized />
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}
