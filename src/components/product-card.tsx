"use client";

import Image from "next/image";
import Link from "next/link";

import { getProductDisplayCode } from "@/lib/product-display-code";
import { productToListEntry } from "@/lib/product-lists";
import type { Product } from "@/lib/types";

import { ProductActionButtons } from "./product-action-buttons";
import { useProductCodeMode } from "./product-display-context";
import { ProductQuantityAddToCart } from "./product-quantity-cart";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  const codeMode = useProductCodeMode();
  const productCode = getProductDisplayCode(product, codeMode);
  const listEntry = productToListEntry(product);

  return (
    <article
      className="group flex h-auto min-h-[28rem] flex-col overflow-hidden bg-[#f2f2f2] shadow-sm transition hover:-translate-y-1 hover:shadow-xl sm:min-h-[33rem] lg:min-h-[36rem]"
      style={{
        borderColor: "rgba(0, 0, 0, 0.10)",
        borderRadius: "var(--product-card-border-radius)",
        borderStyle: "solid",
        borderWidth: "var(--product-card-border-width)",
      }}
    >
      <Link href={`/product/${product.slug}`} className="relative block h-56 shrink-0 overflow-hidden bg-white sm:h-72 lg:h-80">
        <ProductActionButtons
          entry={listEntry}
          className="absolute left-3 top-3 z-10"
        />
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-contain p-2 transition duration-500 group-hover:scale-105 sm:p-4"
        />
      </Link>

      <div className="flex min-h-0 flex-1 flex-col justify-between px-4 pb-5 pt-4 text-center sm:px-5">
        <div>
          <Link href={`/product/${product.slug}`}>
            <h3 className="mx-auto line-clamp-2 min-h-14 max-w-64 text-base font-extrabold leading-7 text-zinc-950 transition group-hover:text-black">
              {product.name}
            </h3>
          </Link>
          <div className="mt-4 flex flex-nowrap items-center justify-between gap-2" dir="rtl">
            <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-3 py-2 text-[13px] font-medium leading-none text-black sm:px-4 sm:text-base lg:text-[17px]">
              {product.price} جنيه
            </span>
            <span className="min-w-0 truncate whitespace-nowrap text-xs font-medium text-zinc-500 sm:text-sm">{productCode}</span>
          </div>
        </div>
        <ProductQuantityAddToCart product={product} variant="card" />
      </div>
    </article>
  );
}
