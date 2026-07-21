import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductImageGallery } from "@/components/product-image-gallery";
import { ProductCard } from "@/components/product-card";
import { ProductDetailTabs } from "@/components/product-detail-tabs";
import { ProductPageActions } from "@/components/product-page-actions";
import { ProductQuantityAddToCart } from "@/components/product-quantity-cart";
import { ProductRichDescription } from "@/components/product-rich-description";
import { ProductShareButtons } from "@/components/product-share-buttons";
import { VisualEditableText } from "@/components/visual-editable-text";
import { getProductCodeLabel, getProductDisplayCode } from "@/lib/product-display-code";
import { productToListEntry } from "@/lib/product-lists";
import { getThemeSettings } from "@/lib/theme-settings";
import { getProductBySlug, getProductReviews, getRelatedProducts } from "@/lib/woocommerce";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return {
      title: "منتج غير موجود",
    };
  }

  return {
    title: product.name,
    description: product.shortDescription,
    openGraph: {
      title: product.name,
      description: product.shortDescription,
      images: [product.image],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const [relatedProducts, settings, reviews] = await Promise.all([
    getRelatedProducts(product),
    getThemeSettings(),
    getProductReviews(product.id),
  ]);

  const codeMode = settings.productCard.codeMode;
  const displayCode = getProductDisplayCode(product, codeMode);
  const codeLabel = getProductCodeLabel(codeMode);
  const listEntry = productToListEntry(product);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    brand: {
      "@type": "Brand",
      name: "SOKANY",
    },
    image: product.image,
    description: product.shortDescription,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: String(Math.max(reviews.length, Number(product.rating) > 0 ? 1 : 0)),
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "EGP",
      price: product.price.replace(/,/g, ""),
      availability:
        product.stockStatus === "instock"
          ? "https://schema.org/InStock"
          : "https://schema.org/PreOrder",
      url: `https://sokany-eg.com/product/${product.slug}`,
    },
  };
  const galleryImages = Array.from(new Set([product.image, ...(product.images || [])])).filter(Boolean);

  return (
    <div className="py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <ProductImageGallery images={galleryImages} productName={product.name} />

          <div className="flex flex-col justify-center">
            <p className="mb-4 inline-flex w-fit rounded-full bg-black px-4 py-2 text-sm font-bold text-brand-gold">
              {product.category}
            </p>
            <h1 className="text-3xl font-bold leading-tight text-zinc-950 sm:text-5xl">
              {product.name}
            </h1>
            <ProductPageActions entry={listEntry} product={product} />
            <p className="mt-5 text-lg leading-9 text-zinc-600">{product.shortDescription}</p>

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <span className="text-4xl font-bold text-zinc-950">{product.price} ج.م</span>
              {product.regularPrice && product.salePrice ? (
                <span className="text-lg font-bold text-zinc-400 line-through">
                  {product.regularPrice} ج.م
                </span>
              ) : null}
              <span className="rounded-full border border-brand-gold/40 bg-brand-gold/20 px-4 py-2 text-sm font-bold text-zinc-950">
                {product.stockStatus === "instock" ? (
                  <VisualEditableText textKey="product.stock.instock">متوفر</VisualEditableText>
                ) : product.stockStatus === "outofstock" ? (
                  <span>غير متوفر</span>
                ) : (
                  <VisualEditableText textKey="product.stock.backorder">متاح بالحجز</VisualEditableText>
                )}
              </span>
            </div>

            <ProductQuantityAddToCart product={product} />
            <ProductShareButtons productName={product.name} productSlug={product.slug} />

            <ProductDetailTabs
              attributes={product.attributes}
              codeLabel={codeLabel}
              displayCode={displayCode}
              rating={product.rating}
              reviews={reviews}
            />
          </div>
        </div>

        <ProductRichDescription html={product.descriptionHtml} fallbackText={product.description} />

        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-bold text-zinc-950">
            <VisualEditableText textKey="product.relatedProducts">منتجات مشابهة</VisualEditableText>
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((related) => (
              <ProductCard key={related.id} product={related} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
