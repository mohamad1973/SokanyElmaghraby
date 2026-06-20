import Image from "next/image";
import Link from "next/link";

import type { Product } from "@/lib/types";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  const isOnSale = product.salePrice && product.regularPrice && product.salePrice !== product.regularPrice;

  return (
    <article className="group overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <Link href={`/product/${product.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-brand-cream">
          {isOnSale ? (
            <span className="absolute right-4 top-4 z-10 rounded-full bg-brand-gold px-3 py-1 text-xs font-bold text-black">
              عرض
            </span>
          ) : null}
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover p-8 transition duration-500 group-hover:scale-105"
          />
        </div>
      </Link>

      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3 text-xs font-bold text-zinc-500">
          <span>{product.category}</span>
          <span>★ {product.rating}</span>
        </div>
        <Link href={`/product/${product.slug}`}>
          <h3 className="line-clamp-2 min-h-14 text-lg font-bold leading-7 text-zinc-950 transition hover:text-brand-gold">
            {product.name}
          </h3>
        </Link>
        <p className="line-clamp-2 min-h-12 text-sm leading-6 text-zinc-600">
          {product.shortDescription}
        </p>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-zinc-500">السعر</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-zinc-950">{product.price} ج.م</span>
              {isOnSale ? (
                <span className="text-sm font-bold text-zinc-400 line-through">
                  {product.regularPrice} ج.م
                </span>
              ) : null}
            </div>
          </div>
          <Link
            href={`/product/${product.slug}`}
            className="rounded-full bg-black px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-gold hover:text-black"
          >
            التفاصيل
          </Link>
        </div>
      </div>
    </article>
  );
}

