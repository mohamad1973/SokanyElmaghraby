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
  const productCount = products.length;
  const attributeColumnWidth = "minmax(9rem, 12rem)";
  const productColumnWidth = "minmax(10rem, 1fr)";
  const gridTemplateColumns = `${attributeColumnWidth} ${Array(productCount).fill(productColumnWidth).join(" ")}`;

  return (
    <div className="grid gap-6" dir="rtl">
      <div
        className="grid gap-4 rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm"
        style={{ gridTemplateColumns: `repeat(${productCount}, minmax(0, 1fr))` }}
      >
        {products.map((product, index) => (
          <div key={product.id} className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
              {index + 1}
            </span>
            <Link
              href={`/product/${product.slug}`}
              className="relative block h-32 w-32 overflow-hidden rounded-2xl bg-zinc-50"
            >
              <Image src={product.image} alt={product.name} fill sizes="128px" className="object-contain p-2" />
            </Link>
            <Link
              href={`/product/${product.slug}`}
              className="line-clamp-2 min-h-12 text-sm font-bold text-zinc-950 hover:text-black"
            >
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
        ))}
      </div>

      <div className="overflow-x-auto rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm font-bold text-zinc-950">المواصفات</p>

        {rows.length === 0 ? (
          <p className="rounded-2xl bg-zinc-50 px-4 py-6 text-center text-sm font-semibold text-zinc-600">
            لم يتم العثور على مواصفات في وصف المنتجات المختارة.
          </p>
        ) : (
        <div className="min-w-max">
          <div
            className="grid items-center border-b border-black/10 py-3 text-sm font-bold"
            style={{ gridTemplateColumns }}
          >
            <span className="sticky right-0 z-20 bg-white px-3 text-right text-zinc-700">الخاصية</span>
            {products.map((product, index) => (
              <span key={`header-${product.id}`} className="px-3 text-center text-zinc-500">
                منتج {index + 1}
              </span>
            ))}
          </div>

          {rows.map((row, rowIndex) => (
            <div
              key={row.attribute}
              className={[
                "grid items-center border-b border-black/5 py-3 text-sm",
                rowIndex % 2 === 0 ? "bg-white" : "bg-zinc-50",
              ].join(" ")}
              style={{ gridTemplateColumns }}
            >
              <span
                className={[
                  "sticky right-0 z-10 px-3 text-right font-bold text-zinc-500",
                  rowIndex % 2 === 0 ? "bg-white" : "bg-zinc-50",
                ].join(" ")}
              >
                {row.attribute}
              </span>
              {row.values.map((value, index) => (
                <span
                  key={`${row.attribute}-${products[index]?.id || index}`}
                  className="px-3 text-center font-bold text-zinc-950"
                >
                  {value}
                </span>
              ))}
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
