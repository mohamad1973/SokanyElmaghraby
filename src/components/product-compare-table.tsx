"use client";

import Image from "next/image";
import Link from "next/link";

import { buildCompareMatrix } from "@/lib/compare-utils";
import type { Product } from "@/lib/types";

import { ProductActionButtons } from "./product-action-buttons";
import { useProductLists } from "./product-lists-provider";
import { productToListEntry } from "@/lib/product-lists";

type ProductCompareTableProps = {
  products: Product[];
};

export function ProductCompareTable({ products }: ProductCompareTableProps) {
  const { removeFromCompare } = useProductLists();
  const rows = buildCompareMatrix(products);

  return (
    <div className="overflow-x-auto rounded-[2rem] border border-black/10 bg-white shadow-sm" dir="rtl">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/10">
            <th className="sticky right-0 z-20 min-w-36 bg-zinc-50 px-4 py-5 text-right font-bold text-zinc-700">
              الخاصية
            </th>
            {products.map((product) => (
              <th key={product.id} className="min-w-52 px-4 py-5 text-center align-top">
                <div className="mx-auto flex max-w-56 flex-col items-center gap-3">
                  <Link href={`/product/${product.slug}`} className="relative block h-32 w-32 overflow-hidden rounded-2xl bg-zinc-50">
                    <Image src={product.image} alt={product.name} fill sizes="128px" className="object-contain p-2" />
                  </Link>
                  <Link href={`/product/${product.slug}`} className="line-clamp-2 text-sm font-bold text-zinc-950 hover:text-black">
                    {product.name}
                  </Link>
                  <p className="text-base font-bold text-zinc-950">{product.price} ج.م</p>
                  <ProductActionButtons entry={productToListEntry(product)} size="sm" />
                  <button
                    type="button"
                    onClick={() => removeFromCompare(product.id)}
                    className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-zinc-600 transition hover:border-brand-gold"
                  >
                    إزالة
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.attribute} className="border-b border-black/5">
              <th className="sticky right-0 z-10 bg-zinc-50 px-4 py-4 text-right font-bold text-zinc-600">
                {row.attribute}
              </th>
              {row.values.map((value, index) => (
                <td key={`${row.attribute}-${products[index]?.id || index}`} className="px-4 py-4 text-center font-bold text-zinc-950">
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
