"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { CategoryMenuSelectionNode } from "@/lib/types";

import { PRESET_CATEGORY_ICONS } from "./category-menu-editor";

type WordpressMenuBuilderProps = {
  flatCategories: CategoryMenuSelectionNode[];
  disabled?: boolean;
  statusError?: string;
};

type MenuTreeNode = CategoryMenuSelectionNode & { depth: number };

function buildInMenuTree(flat: CategoryMenuSelectionNode[]): MenuTreeNode[] {
  const inMenu = flat.filter((item) => item.showInMenu);
  const ids = new Set(inMenu.map((item) => item.id));

  function childrenOf(parentId: number, depth: number): MenuTreeNode[] {
    return inMenu
      .filter((item) => {
        const effectiveParent = ids.has(item.parent) ? item.parent : 0;
        return effectiveParent === parentId;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ar"))
      .map((item) => ({
        ...item,
        depth,
        children: childrenOf(item.id, depth + 1),
      }));
  }

  return childrenOf(0, 0);
}

function flattenMenuTree(nodes: MenuTreeNode[]): MenuTreeNode[] {
  const result: MenuTreeNode[] = [];

  function walk(list: MenuTreeNode[]) {
    for (const node of list) {
      result.push(node);
      if (node.children.length) {
        walk(node.children as MenuTreeNode[]);
      }
    }
  }

  walk(nodes);
  return result;
}

export function WordpressMenuBuilder({
  flatCategories,
  disabled = false,
  statusError,
}: WordpressMenuBuilderProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [leftTab, setLeftTab] = useState<"most" | "all" | "search">("most");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [parentDrafts, setParentDrafts] = useState<Record<number, string>>({});

  const menuTree = useMemo(() => buildInMenuTree(flatCategories), [flatCategories]);
  const menuFlat = useMemo(() => flattenMenuTree(menuTree), [menuTree]);
  const inMenuIds = useMemo(() => new Set(menuFlat.map((item) => item.id)), [menuFlat]);

  const availableCategories = useMemo(() => {
    const notInMenu = flatCategories.filter((item) => !item.showInMenu);
    if (leftTab === "search") {
      const q = search.trim().toLowerCase();
      if (!q) {
        return notInMenu;
      }
      return notInMenu.filter(
        (item) => item.title.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q),
      );
    }
    if (leftTab === "most") {
      return [...notInMenu].sort((a, b) => b.count - a.count).slice(0, 20);
    }
    return [...notInMenu].sort((a, b) => a.title.localeCompare(b.title, "ar"));
  }, [flatCategories, leftTab, search]);

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(availableCategories.map((item) => item.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function refreshAfter(ok: boolean, successMessage?: string) {
    if (!ok) {
      return;
    }
    if (successMessage) {
      setMessage(successMessage);
    }
    router.refresh();
  }

  async function patchCategory(categoryId: number, body: Record<string, unknown>) {
    setIsSaving(true);
    setError("");
    setMessage("");

    const response = await fetch(`/api/admin/category-menu-selection/${categoryId}`, {
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

    return true;
  }

  async function addSelectedToMenu() {
    if (!selectedIds.size) {
      setError("اختر تصنيفاً واحداً على الأقل.");
      return;
    }

    const rootSorts = menuFlat.filter((item) => item.depth === 0).map((item) => item.sortOrder);
    let nextSort = (rootSorts.length ? Math.max(...rootSorts) : 0) + 10;
    const inMenuParents = new Set(menuFlat.map((item) => item.id));

    const items = flatCategories
      .filter((item) => selectedIds.has(item.id))
      .map((item) => {
        const sortOrder = nextSort;
        nextSort += 10;
        const wooParentInMenu = item.parent > 0 && inMenuParents.has(item.parent);
        return {
          id: item.id,
          slug: item.slug,
          showInMenu: true,
          sortOrder,
          parentOverride: wooParentInMenu ? item.parent : null,
        };
      });

    setIsSaving(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/admin/category-menu-selection/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message || "تعذر إضافة التصنيفات للقائمة.");
      return;
    }

    clearSelection();
    await refreshAfter(true, `تمت إضافة ${items.length} عنصر إلى القائمة.`);
  }

  async function removeFromMenu(category: CategoryMenuSelectionNode) {
    const ok = await patchCategory(category.id, {
      slug: category.slug,
      showInMenu: false,
      parentOverride: category.parentOverride,
      sortOrder: category.sortOrder,
      iconUrl: category.iconUrl || null,
    });
    await refreshAfter(ok, "تمت إزالة العنصر من القائمة.");
  }

  async function move(category: CategoryMenuSelectionNode, direction: "up" | "down") {
    const ok = await patchCategory(category.id, { move: direction });
    await refreshAfter(ok);
  }

  async function saveParent(category: CategoryMenuSelectionNode) {
    const draft = parentDrafts[category.id] ?? (category.parentOverride === null ? "woo" : String(category.parentOverride));
    const nextParent = draft === "woo" ? null : draft === "0" ? 0 : Number(draft);

    const ok = await patchCategory(category.id, {
      slug: category.slug,
      showInMenu: true,
      parentOverride: nextParent,
      sortOrder: category.sortOrder,
      iconUrl: category.iconUrl || null,
    });
    await refreshAfter(ok, "تم حفظ الأب.");
  }

  async function setIcon(category: CategoryMenuSelectionNode, url: string | null, clear = false) {
    const ok = await patchCategory(category.id, {
      slug: category.slug,
      showInMenu: true,
      parentOverride: category.parentOverride,
      sortOrder: category.sortOrder,
      iconUrl: url,
      clearIcon: clear,
    });
    await refreshAfter(ok);
  }

  async function uploadIcon(category: CategoryMenuSelectionNode, file: File | null) {
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

    await setIcon(category, payload.url);
  }

  return (
    <div className="space-y-4" dir="rtl">
      {statusError ? (
        <div className="rounded border border-[#dba617] bg-[#fcf9e8] px-4 py-3 text-sm text-[#646970]">
          أزرار التحكم تحتاج تفعيل قاعدة البيانات عبر `DATABASE_URL`.
          <span className="mt-1 block font-mono text-xs">{statusError}</span>
        </div>
      ) : null}

      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        {/* Left: Add menu items */}
        <aside className="rounded border border-[#c3c4c7] bg-white">
          <div className="border-b border-[#c3c4c7] bg-[#f0f0f1] px-4 py-3">
            <h2 className="text-sm font-bold text-[#1d2327]">إضافة عناصر للقائمة</h2>
          </div>

          <details open className="border-b border-[#c3c4c7]">
            <summary className="cursor-pointer list-none bg-[#f6f7f7] px-4 py-3 text-sm font-bold text-[#1d2327] marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex w-full items-center justify-between">
                تصنيفات المنتجات
                <span className="text-xs font-normal text-[#646970]">▾</span>
              </span>
            </summary>

            <div className="px-3 pb-3 pt-1">
              <div className="mb-2 flex gap-1 border-b border-[#c3c4c7] text-xs">
                {(
                  [
                    ["most", "الأكثر استخداماً"],
                    ["all", "عرض الكل"],
                    ["search", "بحث"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLeftTab(key)}
                    className={`-mb-px border-b-2 px-2 py-2 font-bold ${
                      leftTab === key
                        ? "border-[#2271b1] text-[#2271b1]"
                        : "border-transparent text-[#646970] hover:text-[#1d2327]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {leftTab === "search" ? (
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث عن تصنيف..."
                  className="mb-2 w-full rounded border border-[#8c8f94] px-2 py-1.5 text-sm"
                />
              ) : null}

              <div className="max-h-80 overflow-y-auto rounded border border-[#dcdcde] bg-white p-2">
                {!availableCategories.length ? (
                  <p className="px-1 py-3 text-xs text-[#646970]">لا توجد تصنيفات متاحة للإضافة.</p>
                ) : (
                  <ul className="space-y-1">
                    {availableCategories.map((category) => (
                      <li key={category.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm text-[#1d2327] hover:bg-[#f0f6fc]">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={selectedIds.has(category.id)}
                            disabled={disabled || isSaving}
                            onChange={() => toggleSelect(category.id)}
                          />
                          <span>
                            {category.title}
                            <span className="mt-0.5 block text-[11px] text-[#646970]">{category.count} منتج</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-[#1d2327]">
                  <input
                    type="checkbox"
                    checked={
                      availableCategories.length > 0 &&
                      availableCategories.every((item) => selectedIds.has(item.id))
                    }
                    disabled={disabled || isSaving || !availableCategories.length}
                    onChange={(event) => (event.target.checked ? selectAllVisible() : clearSelection())}
                  />
                  تحديد الكل
                </label>
                <button
                  type="button"
                  disabled={disabled || isSaving || !selectedIds.size}
                  onClick={addSelectedToMenu}
                  className="rounded bg-[#2271b1] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#135e96] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "جارٍ الإضافة..." : "إضافة إلى القائمة"}
                </button>
              </div>
            </div>
          </details>

          <div className="px-4 py-3 text-xs leading-6 text-[#646970]">
            اختر التصنيفات من اليسار ثم أضفها إلى هيكل القائمة على اليمين — بنفس أسلوب ووردبريس.
          </div>
        </aside>

        {/* Right: Menu structure */}
        <section className="rounded border border-[#c3c4c7] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c3c4c7] bg-[#f0f0f1] px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-[#1d2327]">هيكل القائمة</h2>
              <p className="mt-1 text-xs text-[#646970]">{menuFlat.length} عنصر في قائمة المتجر</p>
            </div>
            <button
              type="button"
              disabled={disabled || isSaving}
              onClick={() => {
                setMessage("كل تغيير يُحفظ مباشرة. القائمة محدّثة.");
                router.refresh();
              }}
              className="rounded bg-[#2271b1] px-4 py-2 text-xs font-bold text-white hover:bg-[#135e96] disabled:opacity-50"
            >
              حفظ القائمة
            </button>
          </div>

          <div className="p-4">
            {!menuFlat.length ? (
              <div className="rounded border border-dashed border-[#c3c4c7] bg-[#f6f7f7] px-4 py-10 text-center text-sm text-[#646970]">
                أضف تصنيفات من العمود الأيسر لبناء القائمة.
              </div>
            ) : (
              <ul className="space-y-2">
                {menuFlat.map((category) => {
                  const expanded = expandedIds.has(category.id);
                  const parentValue =
                    parentDrafts[category.id] ??
                    (category.parentOverride === null ? "woo" : String(category.parentOverride));
                  const parentOptions = flatCategories.filter(
                    (item) => item.id !== category.id && (inMenuIds.has(item.id) || item.showInMenu),
                  );

                  return (
                    <li
                      key={category.id}
                      style={{ marginInlineStart: category.depth * 24 }}
                      className="rounded border border-[#c3c4c7] bg-[#f6f7f7]"
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {category.iconUrl ? (
                            <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white ring-1 ring-[#c3c4c7]">
                              <Image src={category.iconUrl} alt="" width={20} height={20} unoptimized />
                            </span>
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[#1d2327]">{category.title}</p>
                            {category.depth > 0 ? (
                              <p className="text-[11px] text-[#646970]">عنصر فرعي</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-[#646970] ring-1 ring-[#c3c4c7]">
                            تصنيف
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleExpand(category.id)}
                            className="rounded border border-[#c3c4c7] bg-white px-2 py-1 text-xs text-[#1d2327]"
                            aria-expanded={expanded}
                          >
                            {expanded ? "▴" : "▾"}
                          </button>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="space-y-3 border-t border-[#c3c4c7] bg-white px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={disabled || isSaving}
                              onClick={() => move(category, "up")}
                              className="rounded border border-[#c3c4c7] bg-[#f6f7f7] px-2.5 py-1 text-xs font-bold text-[#1d2327] disabled:opacity-50"
                            >
                              أعلى ↑
                            </button>
                            <button
                              type="button"
                              disabled={disabled || isSaving}
                              onClick={() => move(category, "down")}
                              className="rounded border border-[#c3c4c7] bg-[#f6f7f7] px-2.5 py-1 text-xs font-bold text-[#1d2327] disabled:opacity-50"
                            >
                              أسفل ↓
                            </button>
                            <Link
                              href={category.href}
                              className="rounded border border-[#c3c4c7] bg-[#f6f7f7] px-2.5 py-1 text-xs font-bold text-[#2271b1]"
                            >
                              عرض في المتجر
                            </Link>
                          </div>

                          <label className="grid gap-1 text-xs font-bold text-[#1d2327]">
                            التصنيف الأب
                            <div className="flex flex-wrap gap-2">
                              <select
                                value={parentValue}
                                disabled={disabled || isSaving}
                                onChange={(event) =>
                                  setParentDrafts((prev) => ({ ...prev, [category.id]: event.target.value }))
                                }
                                className="min-w-[200px] rounded border border-[#8c8f94] px-2 py-1.5 text-sm"
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
                                onClick={() => saveParent(category)}
                                className="rounded bg-[#2271b1] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                              >
                                حفظ الأب
                              </button>
                            </div>
                          </label>

                          <div className="grid gap-2">
                            <p className="text-xs font-bold text-[#1d2327]">أيقونة المنيو</p>
                            <div className="flex flex-wrap items-center gap-2">
                              {category.iconUrl ? (
                                <span className="relative inline-flex h-9 w-9 items-center justify-center rounded bg-[#f6f7f7] ring-1 ring-[#c3c4c7]">
                                  <Image src={category.iconUrl} alt="" width={24} height={24} unoptimized />
                                </span>
                              ) : (
                                <span className="text-xs text-[#646970]">لا توجد أيقونة</span>
                              )}
                              <label className="cursor-pointer rounded border border-[#c3c4c7] bg-[#f6f7f7] px-2.5 py-1 text-xs font-bold">
                                رفع أيقونة
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                  className="hidden"
                                  disabled={disabled || isSaving}
                                  onChange={(event) => uploadIcon(category, event.target.files?.[0] || null)}
                                />
                              </label>
                              {category.iconUrl ? (
                                <button
                                  type="button"
                                  disabled={disabled || isSaving}
                                  onClick={() => setIcon(category, null, true)}
                                  className="text-xs font-bold text-[#b32d2e]"
                                >
                                  مسح الأيقونة
                                </button>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {PRESET_CATEGORY_ICONS.map((icon) => (
                                <button
                                  key={icon.key}
                                  type="button"
                                  title={icon.label}
                                  disabled={disabled || isSaving}
                                  onClick={() => setIcon(category, icon.url)}
                                  className={`inline-flex h-9 w-9 items-center justify-center rounded bg-[#f6f7f7] ring-1 transition disabled:opacity-50 ${
                                    category.iconUrl === icon.url ? "ring-[#2271b1]" : "ring-[#c3c4c7]"
                                  }`}
                                >
                                  <Image src={icon.url} alt={icon.label} width={20} height={20} unoptimized />
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={disabled || isSaving}
                            onClick={() => removeFromMenu(category)}
                            className="text-xs font-bold text-[#b32d2e] hover:underline disabled:opacity-50"
                          >
                            إزالة
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex justify-end border-t border-[#c3c4c7] bg-[#f0f0f1] px-4 py-3">
            <button
              type="button"
              disabled={disabled || isSaving}
              onClick={() => {
                setMessage("كل تغيير يُحفظ مباشرة. القائمة محدّثة.");
                router.refresh();
              }}
              className="rounded bg-[#2271b1] px-4 py-2 text-xs font-bold text-white hover:bg-[#135e96] disabled:opacity-50"
            >
              حفظ القائمة
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
