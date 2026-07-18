import Image from "next/image";
import Link from "next/link";

import { getCategoriesWithMenuSelection } from "@/lib/category-menu-selection";
import { getWordPressCategoryTree } from "@/lib/menu";
import type { CategoryMenuSelectionNode } from "@/lib/types";

import { CategoryMenuEditor } from "./category-menu-editor";

function countCategories(categories: CategoryMenuSelectionNode[]): number {
  return categories.reduce((total, category) => total + 1 + countCategories(category.children), 0);
}

function countSelectedCategories(categories: CategoryMenuSelectionNode[]): number {
  return categories.reduce(
    (total, category) => total + (category.showInMenu ? 1 : 0) + countSelectedCategories(category.children),
    0,
  );
}

function CategoryChildren({
  categories,
  allCategories,
  actionsDisabled,
  level = 1,
}: {
  categories: CategoryMenuSelectionNode[];
  allCategories: CategoryMenuSelectionNode[];
  actionsDisabled: boolean;
  level?: number;
}) {
  if (!categories.length) {
    return null;
  }

  return (
    <div className={level === 1 ? "mt-4 grid gap-3" : "mt-2 grid gap-2 pr-4"}>
      {categories.map((category) => (
        <div key={category.id} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {category.iconUrl ? (
                <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-50 ring-1 ring-black/5">
                  <Image src={category.iconUrl} alt="" width={28} height={28} unoptimized />
                </span>
              ) : null}
              <div>
                <p className="text-sm font-bold text-zinc-950">{category.title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  slug: <span className="font-mono">{category.slug}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">{category.count} منتج</span>
              <Link
                href={category.href}
                className="rounded-full bg-brand-gold px-3 py-1 text-black transition hover:bg-brand-gold-dark"
              >
                عرض في المتجر
              </Link>
            </div>
          </div>
          <CategoryMenuEditor category={category} allCategories={allCategories} disabled={actionsDisabled} />
          <CategoryChildren
            categories={category.children}
            allCategories={allCategories}
            actionsDisabled={actionsDisabled}
            level={level + 1}
          />
        </div>
      ))}
    </div>
  );
}

export default async function AdminNavigationPage() {
  const { categories, flatCategories, status } = await getCategoriesWithMenuSelection(
    await getWordPressCategoryTree(),
  );
  const totalCategories = countCategories(categories);
  const selectedCategoriesCount = countSelectedCategories(categories);
  const actionsDisabled = !status.settingsAvailable;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-950">منيو التصنيفات من ووردبريس</h1>
        <p className="mt-2 text-sm leading-7 text-zinc-600">
          تحكم في إظهار التصنيف، الأب داخل منيو المتجر (مستقل عن ووكومرس)، الترتيب، والأيقونات بجانب الاسم.
        </p>
      </div>

      {!status.settingsAvailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          أزرار التحكم تحتاج تفعيل قاعدة البيانات عبر `DATABASE_URL`.
          {status.error ? <span className="mt-1 block font-mono text-xs">{status.error}</span> : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold tracking-wide text-zinc-500">التصنيفات الرئيسية</p>
          <p className="mt-2 text-3xl font-bold text-zinc-950">{categories.length}</p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold tracking-wide text-zinc-500">كل التصنيفات</p>
          <p className="mt-2 text-3xl font-bold text-zinc-950">{totalCategories}</p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold tracking-wide text-zinc-500">داخل المنيو</p>
          <p className="mt-2 text-3xl font-bold text-zinc-950">{selectedCategoriesCount}</p>
        </div>
      </div>

      {!categories.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          لم يتم العثور على تصنيفات من ووردبريس حالياً.
        </div>
      ) : (
        <div className="grid gap-5">
          {categories.map((category) => (
            <section
              key={category.id}
              className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 bg-zinc-50 p-5">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-zinc-200">
                    {category.iconUrl || category.image ? (
                      <Image
                        src={category.iconUrl || category.image || ""}
                        alt={category.title}
                        fill
                        sizes="56px"
                        className="object-contain p-2"
                        unoptimized
                      />
                    ) : (
                      <span className="text-lg font-bold text-zinc-500">{category.title.slice(0, 1)}</span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-zinc-950">{category.title}</h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      ID: {category.id} • slug: <span className="font-mono">{category.slug}</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-full bg-white px-3 py-1 text-zinc-700">{category.count} منتج</span>
                  <span className="rounded-full bg-black px-3 py-1 text-white">
                    {category.children.length} فرعي
                  </span>
                  <Link
                    href={category.href}
                    className="rounded-full bg-brand-gold px-3 py-1 text-black transition hover:bg-brand-gold-dark"
                  >
                    عرض في المتجر
                  </Link>
                </div>
              </div>

              <div className="p-5">
                <CategoryMenuEditor
                  category={category}
                  allCategories={flatCategories}
                  disabled={actionsDisabled}
                />
                {category.children.length ? (
                  <CategoryChildren
                    categories={category.children}
                    allCategories={flatCategories}
                    actionsDisabled={actionsDisabled}
                  />
                ) : (
                  <p className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">
                    لا توجد تصنيفات فرعية تحت هذا التصنيف في ترتيب المنيو الحالي.
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
