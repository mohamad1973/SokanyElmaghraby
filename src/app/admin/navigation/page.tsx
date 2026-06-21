import Image from "next/image";
import Link from "next/link";

import { getCategoriesWithVisibility } from "@/lib/category-visibility";
import { getWordPressCategoryTree } from "@/lib/menu";
import type { CategoryVisibilityNode } from "@/lib/types";

import { CategoryVisibilityToggle } from "./category-visibility-toggle";

function countCategories(categories: CategoryVisibilityNode[]): number {
  return categories.reduce((total, category) => total + 1 + countCategories(category.children), 0);
}

function countHiddenCategories(categories: CategoryVisibilityNode[]): number {
  return categories.reduce(
    (total, category) =>
      total + (category.isVisibleOnFrontend ? 0 : 1) + countHiddenCategories(category.children),
    0,
  );
}

function CategoryChildren({
  categories,
  actionsDisabled,
  level = 1,
}: {
  categories: CategoryVisibilityNode[];
  actionsDisabled: boolean;
  level?: number;
}) {
  if (!categories.length) {
    return null;
  }

  return (
    <div className={level === 1 ? "mt-4 grid gap-3" : "mt-2 grid gap-2 pr-4"}>
      {categories.map((category) => (
        <div
          key={category.id}
          className="rounded-xl border border-black/10 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-zinc-950">{category.title}</p>
              <p className="mt-1 text-xs text-zinc-500">
                slug: <span className="font-mono">{category.slug}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
                {category.count} منتج
              </span>
              <Link
                href={category.href}
                className="rounded-full bg-brand-gold px-3 py-1 text-black transition hover:bg-brand-gold-dark"
              >
                عرض في المتجر
              </Link>
              <CategoryVisibilityToggle
                categoryId={category.id}
                slug={category.slug}
                isVisibleOnFrontend={category.isVisibleOnFrontend}
                disabled={actionsDisabled}
              />
            </div>
          </div>
          <CategoryChildren
            categories={category.children}
            actionsDisabled={actionsDisabled}
            level={level + 1}
          />
        </div>
      ))}
    </div>
  );
}

export default async function AdminNavigationPage() {
  const { categories, status } = await getCategoriesWithVisibility(await getWordPressCategoryTree());
  const totalCategories = countCategories(categories);
  const hiddenCategoriesCount = countHiddenCategories(categories);
  const actionsDisabled = !status.settingsAvailable;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-950">منيو الكاتيجوري من WordPress</h1>
        <p className="mt-2 text-sm leading-7 text-zinc-600">
          هذه الصفحة تستدعي الكاتيجوري والـ sub category مباشرة من WooCommerce REST API
          وتعرضها كشجرة داخل داشبورد Next.js.
        </p>
      </div>

      {!status.settingsAvailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          الداشبورد يعرض كل كاتيجوري WordPress حالياً، لكن أزرار الإظهار والإخفاء تحتاج تفعيل
          قاعدة البيانات عبر `DATABASE_URL`.
          {status.error ? <span className="mt-1 block font-mono text-xs">{status.error}</span> : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Main Categories</p>
          <p className="mt-2 text-3xl font-bold text-zinc-950">{categories.length}</p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">All Categories</p>
          <p className="mt-2 text-3xl font-bold text-zinc-950">{totalCategories}</p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Hidden</p>
          <p className="mt-2 text-3xl font-bold text-zinc-950">{hiddenCategoriesCount}</p>
        </div>
      </div>

      {!categories.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          لم يتم العثور على كاتيجوري من WordPress حالياً. تأكد من أن WooCommerce Store API متاح.
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
                  <div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-zinc-200">
                    {category.image ? (
                      <Image
                        src={category.image}
                        alt={category.title}
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-lg font-bold text-zinc-500">
                        {category.title.slice(0, 1)}
                      </span>
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
                  <span className="rounded-full bg-white px-3 py-1 text-zinc-700">
                    {category.count} منتج
                  </span>
                  <span className="rounded-full bg-black px-3 py-1 text-white">
                    {category.children.length} sub category
                  </span>
                  <Link
                    href={category.href}
                    className="rounded-full bg-brand-gold px-3 py-1 text-black transition hover:bg-brand-gold-dark"
                  >
                    عرض في المتجر
                  </Link>
                  <CategoryVisibilityToggle
                    categoryId={category.id}
                    slug={category.slug}
                    isVisibleOnFrontend={category.isVisibleOnFrontend}
                    disabled={actionsDisabled}
                  />
                </div>
              </div>

              <div className="p-5">
                {category.children.length ? (
                  <CategoryChildren
                    categories={category.children}
                    actionsDisabled={actionsDisabled}
                  />
                ) : (
                  <p className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">
                    لا توجد sub categories تحت هذه الكاتيجوري.
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

