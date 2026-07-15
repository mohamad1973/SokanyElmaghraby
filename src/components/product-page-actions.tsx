"use client";

import type { ProductListEntry } from "@/lib/product-lists";
import type { Product } from "@/lib/types";

import { ProductActionButtons } from "./product-action-buttons";

export function ProductPageActions({
  entry,
  product,
}: {
  entry: ProductListEntry;
  product: Pick<Product, "stockStatus" | "stockQuantity">;
}) {
  return <ProductActionButtons entry={entry} product={product} size="md" className="mt-4" />;
}
