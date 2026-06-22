import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/types";

type ProductRowScrollerProps = {
  products: Product[];
};

export function ProductRowScroller({ products }: ProductRowScrollerProps) {
  const productsWithImages = products.filter((product) => product.images?.length && !product.image.includes("product-placeholder"));

  if (!productsWithImages.length) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="flex snap-x gap-4 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {productsWithImages.map((product) => (
        <div key={product.id} className="shrink-0 basis-[78%] snap-start sm:basis-[46%] lg:basis-[23%]">
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
