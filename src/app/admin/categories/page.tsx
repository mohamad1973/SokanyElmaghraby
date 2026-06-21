import Image from "next/image";
import Link from "next/link";

import { getWordPressCategoryTree } from "@/lib/menu";
import type { WooCategoryNode } from "@/lib/types";

import { ImportButton } from "../import-button";

export const dynamic = "force-dynamic";

function countCategories(categories: WooCategoryNode[]): number {
  return categories.reduce((total, category) => total + 1 + countCategories(category.children), 0);
}

function CategoryTree({ categories, level = 1 }: { categories: WooCategoryNode[]; level?: number }) {
  if (!categories.length) {
    return null;
  }

  return (
    <div className={level === 1 ? "grid gap-3" : "mt-3 grid gap-2 pr-5"}>
      {categories.map((category) => (
        <div key={category.id} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-xl bg-zinc-100">
                {category.image ? (
                  <Image
                    src={category.image}
                    alt={category.title}
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-bold text-zinc-500">
                    {category.title.slice(0, 1)}
                  </span>
                )}
              </div>
              <div>
                <p className="font-bold text-zinc-950">{category.title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  ID: {category.id} | slug: <span className="font-mono">{category.slug}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
                {category.count} منتج
              </span>
              <span className="rounded-full bg-black px-3 py-1 text-white">
                {category.children.length} sub category
              </span>
              <Link
                href={category.href}
                className="rounded-full bg-brand-gold px-3 py-1 text-black transition hover:bg-brand-gold-dark"
              >
                عرض المنتجات
              </Link>
            </div>
          </div>

          <CategoryTree categories={category.children} level={level + 1} />
        </div>
      ))}
    </div>
  );
}

export default async function AdminCategoriesPage() {
  const categories = await getWordPressCategoryTree();
  const totalCategories = countCategories(categories);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-bold text-zinc-950">Categories</h1>
          <p className="mt-2 text-sm leading-7 text-zinc-600">
            عرض مباشر لكل الكاتيجوري والـ sub category من WooCommerce داخل داشبورد Next.js.
          </p>
        </div>
        <ImportButton endpoint="/api/admin/import/categories" label="Import categories from WordPress" />
      </div>

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
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Source</p>
          <p className="mt-2 text-lg font-bold text-zinc-950">WooCommerce</p>
        </div>
      </div>

      {categories.length ? (
        <CategoryTree categories={categories} />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          لم يتم العثور على كاتيجوري من WordPress حالياً.
        </div>
      )}
    </div>
  );
}
