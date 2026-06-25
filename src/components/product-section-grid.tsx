import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/types";

type ProductSectionGridProps = {
  products: Product[];
  desktopColumns: number;
  tabletColumns: number;
  mobileColumns: number;
  rowCount: number;
};

const columnClasses = {
  mobile: {
    1: "grid-cols-1",
    2: "grid-cols-2",
  },
  tablet: {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
  },
  desktop: {
    1: "lg:grid-cols-1",
    2: "lg:grid-cols-2",
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ProductSectionGrid({
  products,
  desktopColumns,
  tabletColumns,
  mobileColumns,
  rowCount,
}: ProductSectionGridProps) {
  const safeDesktopColumns = clamp(desktopColumns || 4, 1, 4) as 1 | 2 | 3 | 4;
  const safeTabletColumns = clamp(tabletColumns || 2, 1, 2) as 1 | 2;
  const safeMobileColumns = clamp(mobileColumns || 1, 1, 2) as 1 | 2;
  const safeRowCount = clamp(rowCount || 1, 1, 6);
  const productsWithImages = products
    .filter((product) => product.images?.length && !product.image.includes("product-placeholder"))
    .slice(0, safeDesktopColumns * safeRowCount);

  if (!productsWithImages.length) {
    return null;
  }

  return (
    <div
      className={[
        "grid gap-6",
        columnClasses.mobile[safeMobileColumns],
        columnClasses.tablet[safeTabletColumns],
        columnClasses.desktop[safeDesktopColumns],
      ].join(" ")}
    >
      {productsWithImages.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
