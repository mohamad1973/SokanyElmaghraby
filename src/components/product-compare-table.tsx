"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { buildCompareMatrix } from "@/lib/compare-utils";
import { productToListEntry } from "@/lib/product-lists";
import type { Product } from "@/lib/types";

import { ProductActionButtons } from "./product-action-buttons";
import { useProductLists } from "./product-lists-provider";

type ProductCompareTableProps = {
  products: Product[];
};

function CompareCell({
  children,
  className = "",
  align = "center",
}: {
  children: ReactNode;
  className?: string;
  align?: "right" | "center";
}) {
  return (
    <div className={`min-w-0 px-3 py-2 text-sm ${className}`}>
      <p
        className={[
          "line-clamp-2 font-bold",
          align === "right" ? "text-right" : "text-center",
        ].join(" ")}
      >
        {children}
      </p>
    </div>
  );
}

export function ProductCompareTable({ products }: ProductCompareTableProps) {
  const { removeFromCompare } = useProductLists();
  const rows = buildCompareMatrix(products);
  const productCount = products.length;
  const columnCount = productCount + 1;
  const gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;

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
            <ProductActionButtons entry={productToListEntry(product)} product={product} size="sm" />
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

      <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm font-bold text-zinc-950">المواصفات</p>

        {rows.length === 0 ? (
          <p className="rounded-2xl bg-zinc-50 px-4 py-6 text-center text-sm font-semibold text-zinc-600">
            لم يتم العثور على مواصفات في وصف المنتجات المختارة.
          </p>
        ) : (
          <div>
            <div
              className="grid items-center border-b border-black/10 py-3 text-sm font-bold"
              style={{ gridTemplateColumns }}
            >
              <CompareCell align="right" className="text-zinc-700">
                الخاصية
              </CompareCell>
              {products.map((product, index) => (
                <CompareCell key={`header-${product.id}`} className="text-zinc-500">
                  منتج {index + 1}
                </CompareCell>
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
                <CompareCell align="right" className="text-zinc-500">
                  {row.attribute}
                </CompareCell>
                {row.values.map((value, index) => (
                  <CompareCell key={`${row.attribute}-${products[index]?.id || index}`} className="text-zinc-950">
                    {value}
                  </CompareCell>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
