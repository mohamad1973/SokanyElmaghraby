import type { Metadata } from "next";

import { ProductCard } from "@/components/product-card";
import { VisualEditableText } from "@/components/visual-editable-text";
import { getProducts } from "@/lib/woocommerce";

export const metadata: Metadata = {
  title: "المتجر",
  description: "تسوق منتجات سوكاني الأصلية في مصر من مؤسسة المغربي الوكيل الحصري.",
};

type ShopPageProps = {
  searchParams: Promise<{
    category?: string;
  }>;
};

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const selectedCategorySlug = params.category;
  const products = await getProducts(24, selectedCategorySlug);

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {products.length ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white p-10 text-center text-sm font-semibold text-zinc-600">
            <VisualEditableText textKey="shop.emptyProducts">لا توجد منتجات داخل هذه المجموعة حالياً.</VisualEditableText>
          </div>
        )}
      </div>
    </div>
  );
}

