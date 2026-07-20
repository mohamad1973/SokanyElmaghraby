"use client";

import { useEffect, useState } from "react";

import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/types";

type ProductSectionGridProps = {
  products: Product[];
  desktopColumns: number;
  tabletColumns: number;
  mobileColumns: number;
  rowCount: number;
  /** Prefer showing at least this many cards when products are available. */
  productLimit?: number;
};

function getSafeColumnCount(value: number | undefined, fallback: number) {
  const parsedValue = Number(value || fallback);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsedValue));
}

function useResponsiveColumns({
  desktopColumns,
  tabletColumns,
  mobileColumns,
}: {
  desktopColumns: number;
  tabletColumns: number;
  mobileColumns: number;
}) {
  const [columns, setColumns] = useState(() => Math.max(2, getSafeColumnCount(mobileColumns, 2)));

  useEffect(() => {
    function updateColumns() {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setColumns(getSafeColumnCount(desktopColumns, 4));
        return;
      }

      if (window.matchMedia("(min-width: 640px)").matches) {
        setColumns(getSafeColumnCount(tabletColumns, 2));
        return;
      }

      setColumns(Math.max(2, getSafeColumnCount(mobileColumns, 2)));
    }

    updateColumns();
    window.addEventListener("resize", updateColumns);

    return () => window.removeEventListener("resize", updateColumns);
  }, [desktopColumns, tabletColumns, mobileColumns]);

  return columns;
}

export function ProductSectionGrid({
  products,
  desktopColumns,
  tabletColumns,
  mobileColumns,
  rowCount,
  productLimit,
}: ProductSectionGridProps) {
  const columns = useResponsiveColumns({ desktopColumns, tabletColumns, mobileColumns });
  const safeRowCount = getSafeColumnCount(rowCount, 1);
  const gridCapacity = columns * safeRowCount;
  const displayLimit = Math.max(gridCapacity, getSafeColumnCount(productLimit, gridCapacity));
  const productsWithImages = products
    .filter((product) => product.images?.length && !product.image.includes("product-placeholder"))
    .slice(0, displayLimit);

  if (!productsWithImages.length) {
    return null;
  }

  return (
    <div
      className="grid gap-6"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {productsWithImages.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
