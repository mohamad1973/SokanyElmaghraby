import Image from "next/image";
import Link from "next/link";

import { CategoryScroller } from "@/components/category-scroller";
import { ProductCard } from "@/components/product-card";
import { SectionTitle } from "@/components/section-title";
import { getThemeSettings } from "@/lib/theme-settings";
import { getCategories, getFeaturedProducts } from "@/lib/woocommerce";

const trustItems = [
  { title: "الوكيل الحصري", text: "منتجات أصلية من مؤسسة المغربي في مصر", icon: "shield" },
  { title: "ضمان عام كامل", text: "ضد عيوب الصناعة مع دعم ما بعد البيع", icon: "check" },
  { title: "دفع مرن", text: "فوري للدفع الإلكتروني أو كاش عند الاستلام", icon: "card" },
  { title: "شحن داخل مصر", text: "تأكيد الطلب قبل الشحن ومتابعة العميل", icon: "truck" },
];

export const dynamic = "force-dynamic";

function TrustIcon({ icon }: { icon: string }) {
  const className = "h-7 w-7";

  if (icon === "check") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M20 7 10 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 3.5 19.5 7v5.5c0 4.2-2.8 6.9-7.5 8-4.7-1.1-7.5-3.8-7.5-8V7L12 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "card") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M4 7.5h16A1.5 1.5 0 0 1 21.5 9v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2.5 11h19M6 16h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "truck") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M3 6.5h11v9H3v-9ZM14 10h3.5l3.5 3.5v2H14V10Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 3.5 19.5 7v5.5c0 4.2-2.8 6.9-7.5 8-4.7-1.1-7.5-3.8-7.5-8V7L12 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12.5 11 14.5 15.5 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Home() {
  const [featuredProducts, categories, settings] = await Promise.all([
    getFeaturedProducts(),
    getCategories(),
    getThemeSettings(),
  ]);
  const categoriesWithImages = categories.filter((category) => category.image);

  return (
    <>
      {settings.hero.enabled ? <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(218,255,0,0.34),_transparent_34%),linear-gradient(135deg,_rgba(0,0,0,0.04),_transparent_45%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:px-8 lg:py-28">
          <div className="flex flex-col justify-center">
            <p className="mb-5 inline-flex w-fit rounded-full border border-brand-gold/40 bg-brand-cream px-4 py-2 text-sm font-medium text-zinc-950">
              {settings.hero.eyebrow}
            </p>
            <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-zinc-950 sm:text-6xl">
              {settings.hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-zinc-600">
              {settings.hero.subtitle}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href={settings.hero.primaryCtaUrl}
                className="rounded-full bg-brand-gold px-8 py-4 text-center text-sm font-bold text-black transition hover:bg-brand-gold-dark"
              >
                {settings.hero.primaryCtaText}
              </Link>
              <Link
                href={settings.hero.secondaryCtaUrl}
                className="rounded-full border border-black/10 bg-white px-8 py-4 text-center text-sm font-bold text-zinc-950 transition hover:border-brand-gold hover:text-brand-gold"
              >
                {settings.hero.secondaryCtaText}
              </Link>
            </div>
          </div>

          <div className="rounded-[2.5rem] border border-black/10 bg-white p-5 shadow-2xl">
            {settings.hero.desktopImage || settings.hero.tabletImage || settings.hero.mobileImage ? (
              <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] bg-brand-cream">
                {settings.hero.desktopImage ? (
                  <Image
                    src={settings.hero.desktopImage}
                    alt={settings.hero.title}
                    fill
                    sizes="(min-width: 1024px) 45vw, 100vw"
                    className="hidden object-cover lg:block"
                    unoptimized
                  />
                ) : null}
                {settings.hero.tabletImage ? (
                  <Image
                    src={settings.hero.tabletImage}
                    alt={settings.hero.title}
                    fill
                    sizes="(min-width: 640px) 100vw, 0vw"
                    className="hidden object-cover sm:block lg:hidden"
                    unoptimized
                  />
                ) : null}
                {settings.hero.mobileImage ? (
                  <Image
                    src={settings.hero.mobileImage}
                    alt={settings.hero.title}
                    fill
                    sizes="100vw"
                    className="object-cover sm:hidden"
                    unoptimized
                  />
                ) : null}
              </div>
            ) : (
              <div className="rounded-[2rem] bg-brand-cream p-8 text-zinc-950">
                <p className="text-sm font-bold text-brand-gold">منتج مميز</p>
                <h2 className="mt-3 text-3xl font-bold leading-tight">
                  أجهزة منزلية وعناية شخصية مناسبة لكل بيت مصري
                </h2>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  {["أجهزة مطبخ", "عناية شخصية", "تنظيف بالبخار", "عروض"].map((item) => (
                    <div key={item} className="rounded-3xl bg-white p-5 shadow-sm">
                      <div className="mb-8 h-20 rounded-2xl bg-gradient-to-br from-brand-gold to-zinc-950" />
                      <p className="font-bold">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section> : null}

      {settings.sections.trustBadges ? <section className="bg-white py-8">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {trustItems.map((item) => (
            <div key={item.title} className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-sm">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gold/10 text-brand-gold">
                <TrustIcon icon={item.icon} />
              </div>
              <h3 className="font-bold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{item.text}</p>
            </div>
          ))}
        </div>
      </section> : null}

      {settings.sections.categories && categoriesWithImages.length ? <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionTitle
            eyebrow="Categories"
            title="تسوق حسب التصنيف"
            description="تنظيم واضح للمنتجات يساعد العميل يوصل للمنتج المناسب بسرعة من الموبايل أو الكمبيوتر."
          />
          <CategoryScroller categories={categoriesWithImages} />
        </div>
      </section> : null}

      {settings.sections.bestSellers ? <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionTitle
            eyebrow="Best Sellers"
            title="الأكثر مبيعاً"
            description="منتجات مختارة لإظهار شكل المتجر النهائي، وستتحدث تلقائياً من WooCommerce عند إضافة مفاتيح API."
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section> : null}

      {settings.sections.competitiveBanner ? <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {settings.sections.customBanner.enabled &&
          (settings.sections.customBanner.desktopImage || settings.sections.customBanner.mobileImage) ? (
            <Link
              href={settings.sections.customBanner.ctaUrl}
              className="relative mb-8 block min-h-[260px] overflow-hidden rounded-[2.5rem] bg-zinc-950"
            >
              {settings.sections.customBanner.desktopImage ? (
                <Image
                  src={settings.sections.customBanner.desktopImage}
                  alt={settings.sections.customBanner.title}
                  fill
                  sizes="100vw"
                  className="hidden object-cover md:block"
                  unoptimized
                />
              ) : null}
              {settings.sections.customBanner.mobileImage ? (
                <Image
                  src={settings.sections.customBanner.mobileImage}
                  alt={settings.sections.customBanner.title}
                  fill
                  sizes="100vw"
                  className="object-cover md:hidden"
                  unoptimized
                />
              ) : null}
            </Link>
          ) : null}
          <div className="grid gap-8 rounded-[2.5rem] bg-zinc-950 p-8 text-white lg:grid-cols-[1fr_0.8fr] lg:p-12">
            <div>
              <p className="text-sm font-bold text-brand-gold">ميزة تنافسية</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                موقع أسرع، صفحات منتجات أغنى، وثقة أوضح من الواجهات السريعة
              </h2>
              <p className="mt-5 max-w-2xl leading-8 text-zinc-300">
                المرحلة القادمة تضيف البحث السريع، الفلاتر المتقدمة، wishlist،
                المقارنة، وربط checkout حقيقي مع WooCommerce وفوري.
              </p>
            </div>
            <div className="grid gap-3 text-sm font-bold text-zinc-200">
              {["SEO عربي للمنتجات", "Schema للمنتج والسعر", "Checkout فوري + COD", "تصميم Mobile-first"].map(
                (item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section> : null}
    </>
  );
}
