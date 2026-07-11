import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductImageGallery } from "@/components/product-image-gallery";
import { ProductCard } from "@/components/product-card";
import { ProductPageActions } from "@/components/product-page-actions";
import { ProductRichDescription } from "@/components/product-rich-description";
import { ProductSpecRow } from "@/components/product-spec-row";
import { VisualEditableText } from "@/components/visual-editable-text";
import { getProductCodeLabel, getProductDisplayCode } from "@/lib/product-display-code";
import { productToListEntry } from "@/lib/product-lists";
import { getThemeSettings } from "@/lib/theme-settings";
import { getProductBySlug, getRelatedProducts } from "@/lib/woocommerce";

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

  const [relatedProducts, settings] = await Promise.all([
    getRelatedProducts(product),
    getThemeSettings(),
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
      reviewCount: "24",
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
            <ProductPageActions entry={listEntry} />
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
                ) : (
                  <VisualEditableText textKey="product.stock.backorder">متاح بالحجز</VisualEditableText>
                )}
              </span>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link
                href="/checkout"
                className="rounded-full bg-brand-gold px-8 py-4 text-center text-sm font-bold text-black transition hover:bg-brand-gold-dark"
              >
                <VisualEditableText textKey="product.buyNow">شراء الآن</VisualEditableText>
              </Link>
              <Link
                href="/cart"
                className="rounded-full border border-black/10 bg-white px-8 py-4 text-center text-sm font-bold text-zinc-950 transition hover:border-brand-gold hover:text-brand-gold"
              >
                <VisualEditableText textKey="product.addToCart">أضف للسلة</VisualEditableText>
              </Link>
            </div>

            <div className="mt-8 grid gap-3 rounded-[2rem] bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-zinc-950">
                <VisualEditableText textKey="product.specifications">المواصفات</VisualEditableText>
              </p>
              {Object.entries(product.attributes).map(([key, value], index) => (
                <ProductSpecRow key={key} label={key} value={value} striped={index % 2 === 1} />
              ))}
              <ProductSpecRow
                label={<VisualEditableText textKey="product.skuLabel">{codeLabel}</VisualEditableText>}
                value={displayCode}
                striped={Object.keys(product.attributes).length % 2 === 1}
              />
            </div>
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

