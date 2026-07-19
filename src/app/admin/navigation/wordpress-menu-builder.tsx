"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CategoryMenuSelectionNode } from "@/lib/types";

import { PRESET_CATEGORY_ICONS } from "./category-menu-editor";

const INDENT = 24;

type WordpressMenuBuilderProps = {
  flatCategories: CategoryMenuSelectionNode[];
  disabled?: boolean;
  statusError?: string;
};

type FlatMenuItem = {
  id: number;
  slug: string;
  title: string;
  href: string;
  count: number;
  iconUrl?: string;
  menuTitle: string | null;
  parentId: number;
  depth: number;
  sortOrder: number;
};

function buildFlatFromCategories(flatCategories: CategoryMenuSelectionNode[]): FlatMenuItem[] {
  const inMenu = flatCategories.filter((item) => item.showInMenu);
  const ids = new Set(inMenu.map((item) => item.id));

  function childrenOf(parentId: number, depth: number): FlatMenuItem[] {
    return inMenu
      .filter((item) => {
        const effectiveParent = ids.has(item.parent) ? item.parent : 0;
        return effectiveParent === parentId;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ar"))
      .flatMap((item) => {
        const node: FlatMenuItem = {
          id: item.id,
          slug: item.slug,
          title: item.title,
          href: item.href,
          count: item.count,
          iconUrl: item.iconUrl,
          menuTitle: item.menuTitle ?? null,
          parentId,
          depth,
          sortOrder: item.sortOrder,
        };
        return [node, ...childrenOf(item.id, depth + 1)];
      });
  }

  return childrenOf(0, 0);
}

function getDragDepth(offset: number, indentationWidth: number) {
  return Math.round(offset / indentationWidth);
}

function getMaxDepth({ previousItem }: { previousItem: FlatMenuItem | undefined }) {
  return previousItem ? previousItem.depth + 1 : 0;
}

function getMinDepth({ nextItem }: { nextItem: FlatMenuItem | undefined }) {
  return nextItem ? nextItem.depth : 0;
}

function getProjection(
  items: FlatMenuItem[],
  activeId: number,
  overId: number,
  dragOffset: number,
  indentationWidth: number,
) {
  const overItemIndex = items.findIndex((item) => item.id === overId);
  const activeItemIndex = items.findIndex((item) => item.id === activeId);
  if (overItemIndex < 0 || activeItemIndex < 0) {
    return null;
  }

  const activeItem = items[activeItemIndex];
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];
  const dragDepth = getDragDepth(dragOffset, indentationWidth);
  const projectedDepth = activeItem.depth + dragDepth;
  const maxDepth = getMaxDepth({ previousItem });
  const minDepth = getMinDepth({ nextItem });
  let depth = projectedDepth;
  if (depth >= maxDepth) {
    depth = maxDepth;
  }
  if (depth < minDepth) {
    depth = minDepth;
  }

  function getParentId() {
    if (depth === 0 || !previousItem) {
      return 0;
    }
    if (depth === previousItem.depth) {
      return previousItem.parentId;
    }
    if (depth > previousItem.depth) {
      return previousItem.id;
    }

    const newParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.parentId;

    return newParent ?? 0;
  }

  return { depth, maxDepth, minDepth, parentId: getParentId() };
}

function getSubtreeIndexes(items: FlatMenuItem[], index: number): number[] {
  const depth = items[index]?.depth ?? 0;
  const indexes = [index];
  for (let i = index + 1; i < items.length; i++) {
    if (items[i].depth <= depth) {
      break;
    }
    indexes.push(i);
  }
  return indexes;
}

function assignSortOrders(items: FlatMenuItem[]): FlatMenuItem[] {
  const counters = new Map<number, number>();
  return items.map((item) => {
    const next = (counters.get(item.parentId) ?? 0) + 10;
    counters.set(item.parentId, next);
    return { ...item, sortOrder: next };
  });
}

function SortableMenuRow({
  item,
  projectedDepth,
  expanded,
  disabled,
  isSaving,
  titleDraft,
  onToggleExpand,
  onTitleDraftChange,
  onSaveTitle,
  onSetIcon,
  onUploadIcon,
  onRemove,
}: {
  item: FlatMenuItem;
  projectedDepth?: number;
  expanded: boolean;
  disabled: boolean;
  isSaving: boolean;
  titleDraft: string;
  onToggleExpand: () => void;
  onTitleDraftChange: (value: string) => void;
  onSaveTitle: () => void;
  onSetIcon: (url: string | null, clear?: boolean) => void;
  onUploadIcon: (file: File | null) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const depth = projectedDepth ?? item.depth;
  const displayName = item.menuTitle?.trim() || item.title;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        marginInlineStart: depth * INDENT,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="rounded border border-[#c3c4c7] bg-[#f6f7f7]"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            className="cursor-grab touch-none rounded border border-[#c3c4c7] bg-white px-2 py-1 text-xs text-[#646970] active:cursor-grabbing"
            aria-label="اسحب لإعادة الترتيب"
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>
          {item.iconUrl ? (
            <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white ring-1 ring-[#c3c4c7]">
              <Image src={item.iconUrl} alt="" width={20} height={20} unoptimized />
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#1d2327]">{displayName}</p>
            {depth > 0 ? <p className="text-[11px] text-[#646970]">عنصر فرعي</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-[#646970] ring-1 ring-[#c3c4c7]">
            تصنيف
          </span>
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded border border-[#c3c4c7] bg-white px-2 py-1 text-xs text-[#1d2327]"
            aria-expanded={expanded}
          >
            {expanded ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-[#c3c4c7] bg-white px-3 py-3">
          <p className="text-xs text-[#646970]">
            اسم ووردبريس: <span className="font-bold text-[#1d2327]">{item.title}</span>
          </p>

          <label className="grid gap-1 text-xs font-bold text-[#1d2327]">
            اسم العرض في الموقع
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={titleDraft}
                disabled={disabled || isSaving}
                onChange={(event) => onTitleDraftChange(event.target.value)}
                placeholder={item.title}
                className="min-w-[200px] flex-1 rounded border border-[#8c8f94] px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={disabled || isSaving}
                onClick={onSaveTitle}
                className="rounded bg-[#2271b1] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                حفظ الاسم
              </button>
            </div>
          </label>

          <div className="flex flex-wrap gap-2">
            <Link
              href={item.href}
              className="rounded border border-[#c3c4c7] bg-[#f6f7f7] px-2.5 py-1 text-xs font-bold text-[#2271b1]"
            >
              عرض في المتجر
            </Link>
          </div>

          <div className="grid gap-2">
            <p className="text-xs font-bold text-[#1d2327]">أيقونة المنيو</p>
            <div className="flex flex-wrap items-center gap-2">
              {item.iconUrl ? (
                <span className="relative inline-flex h-9 w-9 items-center justify-center rounded bg-[#f6f7f7] ring-1 ring-[#c3c4c7]">
                  <Image src={item.iconUrl} alt="" width={24} height={24} unoptimized />
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
                  onChange={(event) => onUploadIcon(event.target.files?.[0] || null)}
                />
              </label>
              {item.iconUrl ? (
                <button
                  type="button"
                  disabled={disabled || isSaving}
                  onClick={() => onSetIcon(null, true)}
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
                  onClick={() => onSetIcon(icon.url)}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded bg-[#f6f7f7] ring-1 transition disabled:opacity-50 ${
                    item.iconUrl === icon.url ? "ring-[#2271b1]" : "ring-[#c3c4c7]"
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
            onClick={onRemove}
            className="text-xs font-bold text-[#b32d2e] hover:underline disabled:opacity-50"
          >
            إزالة من القائمة
          </button>
        </div>
      ) : null}
    </li>
  );
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
  const [titleDrafts, setTitleDrafts] = useState<Record<number, string>>({});
  const [items, setItems] = useState<FlatMenuItem[]>(() => buildFlatFromCategories(flatCategories));
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const offsetLeftRef = useRef(0);

  useEffect(() => {
    setItems(buildFlatFromCategories(flatCategories));
  }, [flatCategories]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const projected =
    activeId && overId ? getProjection(items, activeId, overId, offsetLeft, INDENT) : null;

  const availableCategories = useMemo(() => {
    const inMenu = new Set(items.map((item) => item.id));
    const notInMenu = flatCategories.filter((item) => !inMenu.has(item.id));
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
  }, [flatCategories, items, leftTab, search]);

  const activeItem = activeId ? items.find((item) => item.id === activeId) : null;

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

  async function persistStructure(nextItems: FlatMenuItem[]) {
    const ordered = assignSortOrders(nextItems);
    setItems(ordered);
    setIsSaving(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/admin/category-menu-selection/structure", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: ordered.map((item) => ({
          id: item.id,
          slug: item.slug,
          parentOverride: item.parentId,
          sortOrder: item.sortOrder,
          showInMenu: true,
          menuTitle: item.menuTitle,
          iconUrl: item.iconUrl || null,
        })),
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message || "تعذر حفظ ترتيب القائمة.");
      setItems(buildFlatFromCategories(flatCategories));
      return false;
    }

    setMessage("تم حفظ ترتيب القائمة.");
    router.refresh();
    return true;
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

    router.refresh();
    return true;
  }

  async function addSelectedToMenu() {
    if (!selectedIds.size) {
      setError("اختر تصنيفاً واحداً على الأقل.");
      return;
    }

    const rootSorts = items.filter((item) => item.depth === 0).map((item) => item.sortOrder);
    let nextSort = (rootSorts.length ? Math.max(...rootSorts) : 0) + 10;
    const inMenuParents = new Set(items.map((item) => item.id));

    const payloadItems = flatCategories
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
          parentOverride: wooParentInMenu ? item.parent : 0,
        };
      });

    setIsSaving(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/admin/category-menu-selection/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payloadItems }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message || "تعذر إضافة التصنيفات للقائمة.");
      return;
    }

    setSelectedIds(new Set());
    setMessage(`تمت إضافة ${payloadItems.length} عنصر إلى القائمة.`);
    router.refresh();
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(Number(active.id));
    setOverId(Number(active.id));
    offsetLeftRef.current = 0;
    setOffsetLeft(0);
  }

  function handleDragMove({ delta }: DragMoveEvent) {
    // RTL: dragging toward visual left (into nesting) increases depth when delta.x is negative
    offsetLeftRef.current = -delta.x;
    setOffsetLeft(-delta.x);
  }

  function handleDragOver({ over }: { over: { id: string | number } | null }) {
    setOverId(over ? Number(over.id) : null);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    const dragOffset = offsetLeftRef.current;
    setActiveId(null);
    setOverId(null);
    offsetLeftRef.current = 0;
    setOffsetLeft(0);

    if (!over) {
      return;
    }

    const activeItemId = Number(active.id);
    const overItemId = Number(over.id);
    const projection = getProjection(items, activeItemId, overItemId, dragOffset, INDENT);
    if (!projection) {
      return;
    }

    const activeIndex = items.findIndex((item) => item.id === activeItemId);
    const overIndex = items.findIndex((item) => item.id === overItemId);
    if (activeIndex < 0 || overIndex < 0) {
      return;
    }

    const subtreeIndexes = getSubtreeIndexes(items, activeIndex);
    const subtree = subtreeIndexes.map((index) => items[index]);
    const remaining = items.filter((_, index) => !subtreeIndexes.includes(index));
    const overIndexInRemaining = remaining.findIndex((item) => item.id === overItemId);
    const insertAt =
      overIndexInRemaining < 0
        ? remaining.length
        : activeIndex < overIndex
          ? overIndexInRemaining + 1
          : overIndexInRemaining;

    const depthDelta = projection.depth - subtree[0].depth;
    const movedSubtree = subtree.map((item, index) =>
      index === 0
        ? { ...item, depth: projection.depth, parentId: projection.parentId }
        : { ...item, depth: item.depth + depthDelta },
    );

    // Fix parentIds for descendants relative to moved root
    const idSet = new Set(movedSubtree.map((item) => item.id));
    const withParents = movedSubtree.map((item, index) => {
      if (index === 0) {
        return item;
      }
      // keep parent if still in subtree, else clamp
      if (idSet.has(item.parentId)) {
        return item;
      }
      return { ...item, parentId: projection.parentId };
    });

    const next = [...remaining.slice(0, insertAt), ...withParents, ...remaining.slice(insertAt)];

    const byId = new Map(next.map((item) => [item.id, item]));
    function depthOf(id: number, seen = new Set<number>()): number {
      const node = byId.get(id);
      if (!node) {
        return 0;
      }
      if (node.parentId === 0 || !byId.has(node.parentId)) {
        return 0;
      }
      if (seen.has(id)) {
        return 0;
      }
      seen.add(id);
      return depthOf(node.parentId, seen) + 1;
    }

    const withDepth = next.map((item) => {
      if (item.parentId !== 0 && !byId.has(item.parentId)) {
        return { ...item, parentId: 0, depth: 0 };
      }
      return { ...item, depth: depthOf(item.id) };
    });

    await persistStructure(withDepth);
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverId(null);
    offsetLeftRef.current = 0;
    setOffsetLeft(0);
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
                    onChange={(event) =>
                      setSelectedIds(
                        event.target.checked ? new Set(availableCategories.map((item) => item.id)) : new Set(),
                      )
                    }
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
        </aside>

        <section className="rounded border border-[#c3c4c7] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c3c4c7] bg-[#f0f0f1] px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-[#1d2327]">هيكل القائمة</h2>
              <p className="mt-1 text-xs text-[#646970]">
                اسحب العناصر لإعادة الترتيب أو التداخل. أول عنصر رئيسي يظهر يمين شريط المنيو.
              </p>
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
            {!items.length ? (
              <div className="rounded border border-dashed border-[#c3c4c7] bg-[#f6f7f7] px-4 py-10 text-center text-sm text-[#646970]">
                أضف تصنيفات من العمود الأيسر لبناء القائمة.
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <SortableMenuRow
                        key={item.id}
                        item={item}
                        projectedDepth={
                          item.id === activeId && projected ? projected.depth : undefined
                        }
                        expanded={expandedIds.has(item.id)}
                        disabled={disabled}
                        isSaving={isSaving}
                        titleDraft={titleDrafts[item.id] ?? item.menuTitle ?? ""}
                        onToggleExpand={() => toggleExpand(item.id)}
                        onTitleDraftChange={(value) =>
                          setTitleDrafts((prev) => ({ ...prev, [item.id]: value }))
                        }
                        onSaveTitle={async () => {
                          const draft = (titleDrafts[item.id] ?? item.menuTitle ?? "").trim();
                          const ok = await patchCategory(item.id, {
                            slug: item.slug,
                            showInMenu: true,
                            parentOverride: item.parentId,
                            sortOrder: item.sortOrder,
                            iconUrl: item.iconUrl || null,
                            menuTitle: draft || null,
                            clearMenuTitle: !draft,
                          });
                          if (ok) {
                            setMessage("تم حفظ اسم العرض.");
                          }
                        }}
                        onSetIcon={async (url, clear) => {
                          await patchCategory(item.id, {
                            slug: item.slug,
                            showInMenu: true,
                            parentOverride: item.parentId,
                            sortOrder: item.sortOrder,
                            menuTitle: item.menuTitle,
                            iconUrl: url,
                            clearIcon: clear,
                          });
                        }}
                        onUploadIcon={async (file) => {
                          if (!file) {
                            return;
                          }
                          const formData = new FormData();
                          formData.set("file", file);
                          formData.set("purpose", "category-icon");
                          setIsSaving(true);
                          const response = await fetch("/api/admin/upload", {
                            method: "POST",
                            body: formData,
                          });
                          const payload = (await response.json().catch(() => null)) as {
                            url?: string;
                            message?: string;
                          } | null;
                          setIsSaving(false);
                          if (!response.ok || !payload?.url) {
                            setError(payload?.message || "تعذر رفع الأيقونة.");
                            return;
                          }
                          await patchCategory(item.id, {
                            slug: item.slug,
                            showInMenu: true,
                            parentOverride: item.parentId,
                            sortOrder: item.sortOrder,
                            menuTitle: item.menuTitle,
                            iconUrl: payload.url,
                          });
                        }}
                        onRemove={async () => {
                          const ok = await patchCategory(item.id, {
                            slug: item.slug,
                            showInMenu: false,
                            parentOverride: item.parentId,
                            sortOrder: item.sortOrder,
                            menuTitle: item.menuTitle,
                            iconUrl: item.iconUrl || null,
                          });
                          if (ok) {
                            setMessage("تمت إزالة العنصر من القائمة.");
                          }
                        }}
                      />
                    ))}
                  </ul>
                </SortableContext>
                <DragOverlay>
                  {activeItem ? (
                    <div className="rounded border border-[#2271b1] bg-white px-3 py-2 text-sm font-bold shadow-lg">
                      {activeItem.menuTitle?.trim() || activeItem.title}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
