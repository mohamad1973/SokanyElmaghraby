import Image from "next/image";
import Link from "next/link";

import type { Product } from "@/lib/types";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="group overflow-hidden bg-[#f2f2f2] shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <Link href={`/product/${product.slug}`} className="block h-full">
        <div className="relative h-72 overflow-hidden bg-[#f2f2f2]">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-contain p-6 transition duration-500 group-hover:scale-105"
          />
        </div>

        <div className="px-5 pb-7 pt-2 text-center">
          <span className="inline-flex bg-brand-gold px-3 py-1 text-[10px] font-extrabold uppercase leading-none text-black">
            {product.category}
          </span>
          <h3 className="mx-auto mt-4 line-clamp-2 min-h-14 max-w-64 text-base font-extrabold leading-7 text-zinc-950 transition group-hover:text-black">
            {product.name}
          </h3>
          <p className="mt-3 text-sm font-medium text-zinc-500">{product.sku}</p>
        </div>
        </Link>
    </article>
  );
}

