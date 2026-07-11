"use client";

import type { ProductListEntry } from "@/lib/product-lists";

import { ProductActionButtons } from "./product-action-buttons";

export function ProductPageActions({ entry }: { entry: ProductListEntry }) {
  return <ProductActionButtons entry={entry} size="md" className="mt-4" />;
}
