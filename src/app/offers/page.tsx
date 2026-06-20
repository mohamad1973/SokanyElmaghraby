import type { Metadata } from "next";

import { ProductCard } from "@/components/product-card";
import { SectionTitle } from "@/components/section-title";
import { getProducts } from "@/lib/woocommerce";

export const metadata: Metadata = {
  title: "عروض سوكاني",
};

export default async function OffersPage() {
  const products = await getProducts(8);

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="Offers"
          title="عروض سوكاني"
          description="صفحة مخصصة للعروض الموسمية والحملات، وهي نقطة مهمة للتفوق التجاري على المنافس."
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
}

