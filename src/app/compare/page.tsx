"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ProductCompareTable } from "@/components/product-compare-table";
import { useProductLists } from "@/components/product-lists-provider";
import { orderProductsByIds } from "@/lib/compare-utils";
import type { Product } from "@/lib/types";

export default function ComparePage() {
  const { compareList } = useProductLists();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (compareList.length < 2) {
      setProducts([]);
      return;
    }

    const controller = new AbortController();

    async function loadProducts() {
      setIsLoading(true);

      try {
        const ids = compareList.map((entry) => entry.id).join(",");
        const response = await fetch(`/api/products/compare?ids=${ids}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as { products?: Product[] };
        const orderedIds = compareList.map((entry) => entry.id);

        setProducts(orderProductsByIds(payload.products || [], orderedIds));
      } catch {
        if (!controller.signal.aborted) {
          setProducts([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadProducts();

    return () => controller.abort();
  }, [compareList]);

  return (
    <div className="py-12" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-bold text-brand-gold">مقارنة المنتجات</p>
          <h1 className="mt-2 text-3xl font-bold text-zinc-950 sm:text-4xl">قارن بين المنتجات</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
            اختر حتى 4 منتجات من كروت المنتجات أو صفحة المنتج، ثم قارن المواصفات جنباً إلى جنب.
          </p>
        </div>

        {compareList.length < 2 ? (
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-bold text-zinc-950">اختر منتجين على الأقل للمقارنة</p>
            <p className="mt-3 text-sm leading-7 text-zinc-600">
              استخدم أيقونة المقارنة على كارت المنتج لإضافة المنتجات إلى قائمة المقارنة.
            </p>
            <Link
              href="/shop"
              className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-gold hover:text-black"
            >
              تصفح المتجر
            </Link>
          </div>
        ) : null}

        {compareList.length >= 2 && isLoading ? (
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-bold text-zinc-600">جاري تحميل بيانات المقارنة...</p>
          </div>
        ) : null}

        {compareList.length >= 2 && !isLoading && products.length ? (
          <ProductCompareTable products={products} />
        ) : null}

        {compareList.length >= 2 && !isLoading && !products.length ? (
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-bold text-zinc-600">تعذر تحميل بيانات المنتجات المختارة.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
