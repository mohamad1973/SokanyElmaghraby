import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/types";

type ProductRowScrollerProps = {
  products: Product[];
  desktopColumns?: number;
  tabletColumns?: number;
  mobileColumns?: number;
};

const basisClasses = {
  mobile: {
    1: "basis-[78%]",
    2: "basis-[46%]",
  },
  tablet: {
    1: "sm:basis-[78%]",
    2: "sm:basis-[46%]",
  },
  desktop: {
    1: "lg:basis-[78%]",
    2: "lg:basis-[46%]",
    3: "lg:basis-[31%]",
    4: "lg:basis-[23%]",
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ProductRowScroller({
  products,
  desktopColumns = 4,
  tabletColumns = 2,
  mobileColumns = 1,
}: ProductRowScrollerProps) {
  const productsWithImages = products.filter((product) => product.images?.length && !product.image.includes("product-placeholder"));
  const safeDesktopColumns = clamp(desktopColumns, 1, 4) as 1 | 2 | 3 | 4;
  const safeTabletColumns = clamp(tabletColumns, 1, 2) as 1 | 2;
  const safeMobileColumns = clamp(mobileColumns, 1, 2) as 1 | 2;

  if (!productsWithImages.length) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="flex snap-x gap-4 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {productsWithImages.map((product) => (
        <div
          key={product.id}
          className={[
            "shrink-0 snap-start",
            basisClasses.mobile[safeMobileColumns],
            basisClasses.tablet[safeTabletColumns],
            basisClasses.desktop[safeDesktopColumns],
          ].join(" ")}
        >
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
