import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProductCard } from "@/components/product-card";
import { VisualEditableText } from "@/components/visual-editable-text";
import { getProducts } from "@/lib/woocommerce";

type ShopPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    category?: string;
  }>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop" });
  return {
    title: t("title"),
  };
}

export default async function ShopPage({ params, searchParams }: ShopPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("shop");
  const query = await searchParams;
  const selectedCategorySlug = query.category;
  const products = await getProducts(24, selectedCategorySlug);

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-3xl font-bold text-zinc-950">{t("title")}</h1>
        {products.length ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white p-10 text-center text-sm font-semibold text-zinc-600">
            <VisualEditableText textKey="shop.emptyProducts">{t("noProducts")}</VisualEditableText>
          </div>
        )}
      </div>
    </div>
  );
}
