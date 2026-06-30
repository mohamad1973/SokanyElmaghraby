"use client";

import { useEffect, useRef, useState } from "react";

import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/types";

type ProductRowScrollerProps = {
  products: Product[];
  desktopColumns?: number;
  tabletColumns?: number;
  mobileColumns?: number;
};

const gapSizeRem = 1;

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

export function ProductRowScroller({
  products,
  desktopColumns = 4,
  tabletColumns = 2,
  mobileColumns = 2,
}: ProductRowScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const productsWithImages = products.filter((product) => product.images?.length && !product.image.includes("product-placeholder"));
  const columns = useResponsiveColumns({ desktopColumns, tabletColumns, mobileColumns });
  const activeIndexRef = useRef(0);
  const itemBasis = `calc((100% - (${columns} - 1) * ${gapSizeRem}rem) / ${columns})`;

  useEffect(() => {
    activeIndexRef.current = 0;
    scrollerRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [columns, productsWithImages.length]);

  useEffect(() => {
    if (productsWithImages.length <= columns) {
      return;
    }

    const interval = window.setInterval(() => {
      const scroller = scrollerRef.current;

      if (!scroller) {
        return;
      }

      activeIndexRef.current =
        activeIndexRef.current >= productsWithImages.length - columns ? 0 : activeIndexRef.current + 1;

      const firstItem = scroller.firstElementChild as HTMLElement | null;
      const itemWidth = firstItem?.getBoundingClientRect().width || 0;
      const gap = Number.parseFloat(window.getComputedStyle(scroller).columnGap || "0");
      const nextLeft = activeIndexRef.current * (itemWidth + gap);

      scroller.scrollTo({
        left: nextLeft,
        behavior: "smooth",
      });
    }, 3000);

    return () => window.clearInterval(interval);
  }, [columns, productsWithImages.length]);

  if (!productsWithImages.length) {
    return null;
  }

  return (
    <div
      ref={scrollerRef}
      dir="ltr"
      className="flex snap-x gap-4 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {productsWithImages.map((product) => (
        <div
          key={product.id}
          className="shrink-0 snap-start"
          style={{ flexBasis: itemBasis }}
        >
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
