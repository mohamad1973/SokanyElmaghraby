import type { Metadata } from "next";

import { ProductCard } from "@/components/product-card";
import { SectionTitle } from "@/components/section-title";
import { VisualEditableText } from "@/components/visual-editable-text";
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
          eyebrow="المتجر"
          title={selectedCategory ? <>{selectedCategory.name}</> : <VisualEditableText textKey="shop.title">متجر سوكاني مصر</VisualEditableText>}
          description={
            selectedCategory
              ? <>{selectedCategory.description} - {products.length} منتج داخل هذه المجموعة.</>
              : (
                <VisualEditableText textKey="shop.description">
                  واجهة سريعة للمنتجات الحالية، جاهزة للربط المباشر مع ووكومرس والفلاتر المتقدمة.
                </VisualEditableText>
              )
          }
        />

        <div className="mb-8 flex gap-3 overflow-x-auto pb-2">
          <a
            href="/shop"
            className={`whitespace-nowrap rounded-full px-5 py-3 text-sm font-bold ${
              selectedCategorySlug ? "bg-white text-zinc-700" : "bg-black text-white"
            }`}
          >
            <VisualEditableText textKey="shop.allProducts">كل المنتجات</VisualEditableText>
          </a>
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

        {selectedCategorySlug ? (
          <div className="mb-6 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-zinc-950">
              <VisualEditableText textKey="shop.selectedCategoryPrefix">المنتجات المعروضة حالياً تخص مجموعة:</VisualEditableText>{" "}
              {selectedCategory?.name || selectedCategorySlug}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              <VisualEditableText textKey="shop.selectedCategoryDescription">
                يتم جلب المنتجات مباشرة من ووكومرس، ولو المجموعة تحتوي تصنيفات فرعية يتم تضمين منتجاتها أيضاً.
              </VisualEditableText>
            </p>
          </div>
        ) : null}

        {products.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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

