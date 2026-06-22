"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type SearchProduct = {
  id: number;
  name: string;
  slug: string;
  sku: string;
  price: string;
  image: string;
};

export function HeaderProductSearch({ className = "relative hidden min-w-72 max-w-md flex-1 lg:block" }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(trimmedQuery)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as { products?: SearchProduct[] } | null;

        setProducts(payload?.products || []);
      } catch {
        if (!controller.signal.aborted) {
          setProducts([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  return (
    <div className={className} dir="rtl">
      <input
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);

          if (nextQuery.trim().length < 2) {
            setProducts([]);
          }
        }}
        placeholder="ابحث عن منتجك"
        className="w-full rounded-full border border-black/10 bg-zinc-50 px-5 py-3 text-sm font-bold text-zinc-950 outline-none transition focus:border-brand-gold focus:bg-white"
      />
      {query.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-[70] mt-3 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl">
          {isLoading ? <p className="px-5 py-4 text-sm font-bold text-zinc-500">جاري البحث...</p> : null}
          {!isLoading && products.length === 0 ? (
            <p className="px-5 py-4 text-sm font-bold text-zinc-500">لا توجد منتجات مطابقة.</p>
          ) : null}
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/product/${product.slug}`}
              onClick={() => setQuery("")}
              className="flex items-center gap-3 border-b border-black/5 px-4 py-3 transition last:border-b-0 hover:bg-brand-cream"
            >
              <span className="relative h-14 w-14 overflow-hidden rounded-2xl bg-zinc-100">
                <Image src={product.image} alt={product.name} fill sizes="56px" className="object-contain p-2" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 block text-sm font-bold text-zinc-950">{product.name}</span>
                <span className="mt-1 block text-xs font-bold text-zinc-500">{product.sku}</span>
              </span>
              <span className="text-sm font-bold text-zinc-950">{product.price} ج.م</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
