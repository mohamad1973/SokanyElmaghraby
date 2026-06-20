import type { Metadata } from "next";

import { ProductCard } from "@/components/product-card";
import { SectionTitle } from "@/components/section-title";
import { getCategories, getProducts } from "@/lib/woocommerce";

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
  const [products, categories] = await Promise.all([
    getProducts(24, selectedCategorySlug),
    getCategories(),
  ]);
  const selectedCategory = categories.find((category) => category.slug === selectedCategorySlug);

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="Shop"
          title={selectedCategory ? selectedCategory.name : "متجر سوكاني مصر"}
          description={
            selectedCategory
              ? selectedCategory.description
              : "واجهة سريعة للمنتجات الحالية، جاهزة للربط المباشر مع WooCommerce والفلاتر المتقدمة."
          }
        />

        <div className="mb-8 flex gap-3 overflow-x-auto pb-2">
          <span className="whitespace-nowrap rounded-full bg-black px-5 py-3 text-sm font-bold text-white">
            كل المنتجات
          </span>
          {categories.map((category) => (
            <a
              key={category.id}
              href={`/shop?category=${category.slug}`}
              className={`whitespace-nowrap rounded-full border border-black/10 px-5 py-3 text-sm font-bold ${
                selectedCategorySlug === category.slug
                  ? "bg-brand-gold text-black"
                  : "bg-white text-zinc-700"
              }`}
            >
              {category.name}
            </a>
          ))}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
}

