"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ProductCodeMode } from "@/lib/product-display-code";

const ProductDisplayContext = createContext<ProductCodeMode>("titleSk");

export function ProductDisplayProvider({
  codeMode,
  children,
}: {
  codeMode: ProductCodeMode;
  children: ReactNode;
}) {
  return <ProductDisplayContext.Provider value={codeMode}>{children}</ProductDisplayContext.Provider>;
}

export function useProductCodeMode() {
  return useContext(ProductDisplayContext);
}
