"use client";

import Image from "next/image";
import Link from "next/link";

import { getProductDisplayCode } from "@/lib/product-display-code";
import type { Product } from "@/lib/types";

import { useProductCodeMode } from "./product-display-context";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  const codeMode = useProductCodeMode();
  const productCode = getProductDisplayCode(product, codeMode);

  return (
    <article
      className="group h-[24rem] overflow-hidden bg-[#f2f2f2] shadow-sm transition hover:-translate-y-1 hover:shadow-xl sm:h-[29rem] lg:h-[32rem]"
      style={{
        borderColor: "rgba(0, 0, 0, 0.10)",
        borderRadius: "var(--product-card-border-radius)",
        borderStyle: "solid",
        borderWidth: "var(--product-card-border-width)",
      }}
    >
      <Link href={`/product/${product.slug}`} className="flex h-full flex-col">
        <div className="relative h-56 shrink-0 overflow-hidden bg-white sm:h-72 lg:h-80">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-contain p-2 transition duration-500 group-hover:scale-105 sm:p-4"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center px-4 pb-6 pt-4 text-center sm:px-5 sm:pb-7">
          <h3 className="mx-auto line-clamp-2 min-h-14 max-w-64 text-base font-extrabold leading-7 text-zinc-950 transition group-hover:text-black">
            {product.name}
          </h3>
          <div className="mt-5 flex flex-nowrap items-center justify-between gap-2" dir="rtl">
            <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-3 py-2 text-[13px] font-medium leading-none text-black sm:px-4 sm:text-base lg:text-[17px]">
              {product.price} جنيه
            </span>
            <span className="min-w-0 truncate whitespace-nowrap text-xs font-medium text-zinc-500 sm:text-sm">{productCode}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
