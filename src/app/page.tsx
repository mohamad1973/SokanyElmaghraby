import Image from "next/image";
import Link from "next/link";

import { CategoryScroller } from "@/components/category-scroller";
import { ProductCard } from "@/components/product-card";
import { SectionTitle } from "@/components/section-title";
import { VisualEditableText } from "@/components/visual-editable-text";
import { getThemeSettings, type HomeSectionId } from "@/lib/theme-settings";
import { getCategories, getFeaturedProducts, getProducts } from "@/lib/woocommerce";

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
  const customSectionProducts = new Map(
    await Promise.all(
      settings.customSections.map(async (section) => [
        section.id,
        section.categorySlug ? await getProducts(section.productLimit, section.categorySlug) : [],
      ] as const),
    ),
  );
  const heroHasImage = Boolean(
    settings.hero.desktopImage || settings.hero.tabletImage || settings.hero.mobileImage,
  );
  const heroTextClass = settings.hero.textTone === "dark" ? "text-zinc-950" : "text-white";
  const heroSubtextClass = settings.hero.textTone === "dark" ? "text-zinc-700" : "text-white/85";
  const heroContentJustifyClass = {
    right: "justify-end",
    center: "justify-center",
    left: "justify-start",
  }[settings.hero.contentAlign];
  const heroContentTextAlignClass = {
    right: "text-right items-end",
    center: "text-center items-center",
    left: "text-left items-start",
  }[settings.hero.contentAlign];
  const heroButtonAlignClass = {
    right: "sm:justify-end",
    center: "sm:justify-center",
    left: "sm:justify-start",
  }[settings.hero.contentAlign];
  const sectionOrder = (sectionId: HomeSectionId) => {
    const order = settings.homeSectionsOrder.indexOf(sectionId);
    return order === -1 ? 100 : order;
  };

  return (
    <div className="flex flex-col">
      {settings.hero.enabled ? (
        heroHasImage ? (
          <section className="relative min-h-[640px] overflow-hidden bg-zinc-950" style={{ order: sectionOrder("hero") }}>
            {settings.hero.desktopImage ? (
              <Image
                src={settings.hero.desktopImage}
                alt={settings.hero.title}
                fill
                priority
                sizes="100vw"
                className="hidden object-cover lg:block"
                unoptimized
              />
            ) : null}
            {settings.hero.tabletImage ? (
              <Image
                src={settings.hero.tabletImage}
                alt={settings.hero.title}
                fill
                sizes="100vw"
                className={`hidden object-cover sm:block ${settings.hero.desktopImage ? "lg:hidden" : ""}`}
                unoptimized
              />
            ) : null}
            {!settings.hero.tabletImage && settings.hero.desktopImage ? (
              <Image
                src={settings.hero.desktopImage}
                alt={settings.hero.title}
                fill
                sizes="100vw"
                className="hidden object-cover sm:block lg:hidden"
                unoptimized
              />
            ) : null}
            {settings.hero.mobileImage || settings.hero.tabletImage || settings.hero.desktopImage ? (
              <Image
                src={settings.hero.mobileImage || settings.hero.tabletImage || settings.hero.desktopImage}
                alt={settings.hero.title}
                fill
                sizes="100vw"
                className={settings.hero.tabletImage || settings.hero.desktopImage ? "object-cover sm:hidden" : "object-cover"}
                unoptimized
              />
            ) : null}
            {settings.hero.overlayEnabled ? <div className="absolute inset-0 bg-black/35" /> : null}
            <div
              className={`relative mx-auto flex min-h-[640px] max-w-7xl items-center px-4 py-24 sm:px-6 lg:px-8 ${heroContentJustifyClass}`}
            >
              <div
                className={`flex max-w-3xl flex-col ${heroContentTextAlignClass} ${settings.hero.frameEnabled ? "rounded-[2rem] border border-white/20 bg-black/25 p-8 backdrop-blur-sm" : ""}`}
              >
                <p className="mb-5 inline-flex w-fit rounded-full bg-brand-gold px-4 py-2 text-sm font-bold text-black">
                  <VisualEditableText textKey="hero.eyebrow">{settings.hero.eyebrow}</VisualEditableText>
                </p>
                <h1 className={`text-4xl font-bold leading-tight tracking-tight sm:text-6xl ${heroTextClass}`}>
                  <VisualEditableText textKey="hero.title">{settings.hero.title}</VisualEditableText>
                </h1>
                <p className={`mt-6 max-w-2xl text-lg leading-9 ${heroSubtextClass}`}>
                  <VisualEditableText textKey="hero.subtitle">{settings.hero.subtitle}</VisualEditableText>
                </p>
                <div className={`mt-9 flex w-full flex-col gap-3 sm:flex-row ${heroButtonAlignClass}`}>
                  <Link
                    href={settings.hero.primaryCtaUrl}
                    className="rounded-full bg-brand-gold px-8 py-4 text-center text-sm font-bold text-black transition hover:bg-brand-gold-dark"
                  >
                    <VisualEditableText textKey="hero.primaryCtaText">{settings.hero.primaryCtaText}</VisualEditableText>
                  </Link>
                  <Link
                    href={settings.hero.secondaryCtaUrl}
                    className="rounded-full border border-white/30 bg-white/10 px-8 py-4 text-center text-sm font-bold text-white transition hover:border-brand-gold hover:text-brand-gold"
                  >
                    <VisualEditableText textKey="hero.secondaryCtaText">{settings.hero.secondaryCtaText}</VisualEditableText>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="relative overflow-hidden bg-white" style={{ order: sectionOrder("hero") }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(218,255,0,0.34),_transparent_34%),linear-gradient(135deg,_rgba(0,0,0,0.04),_transparent_45%)]" />
            <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
              <p className="mb-5 inline-flex w-fit rounded-full border border-brand-gold/40 bg-brand-cream px-4 py-2 text-sm font-medium text-zinc-950">
                <VisualEditableText textKey="hero.eyebrow">{settings.hero.eyebrow}</VisualEditableText>
              </p>
              <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-zinc-950 sm:text-6xl">
                <VisualEditableText textKey="hero.title">{settings.hero.title}</VisualEditableText>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-9 text-zinc-600">
                <VisualEditableText textKey="hero.subtitle">{settings.hero.subtitle}</VisualEditableText>
              </p>
            </div>
          </section>
        )
      ) : null}

      {settings.sections.trustBadges ? <section className="bg-white py-8" style={{ order: sectionOrder("trustBadges") }}>
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {trustItems.map((item) => (
            <div key={item.title} className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-sm">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gold/10 text-brand-gold">
                <TrustIcon icon={item.icon} />
              </div>
              <h3 className="font-bold text-white">
                <VisualEditableText textKey={`trust.${item.icon}.title`}>{item.title}</VisualEditableText>
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                <VisualEditableText textKey={`trust.${item.icon}.text`}>{item.text}</VisualEditableText>
              </p>
            </div>
          ))}
        </div>
      </section> : null}

      {settings.sections.categories && categoriesWithImages.length ? <section className="py-16" style={{ order: sectionOrder("categories") }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionTitle
            textKeyPrefix="home.categories"
            eyebrow="التصنيفات"
            title="تسوق حسب التصنيف"
            description="تنظيم واضح للمنتجات يساعد العميل يوصل للمنتج المناسب بسرعة من الموبايل أو الكمبيوتر."
          />
          <CategoryScroller categories={categoriesWithImages} />
        </div>
      </section> : null}

      {settings.sections.bestSellers ? <section className="bg-white py-16" style={{ order: sectionOrder("bestSellers") }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionTitle
            textKeyPrefix="home.bestSellers"
            eyebrow="الأكثر طلباً"
            title="الأكثر مبيعاً"
            description="منتجات مختارة لإظهار شكل المتجر النهائي، وستتحدث تلقائياً من ووكومرس عند إضافة مفاتيح الربط."
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section> : null}

      {settings.customSections
        .filter((section) => section.enabled)
        .map((section) => {
          const sectionProducts = customSectionProducts.get(section.id) || [];
          const backgroundImage = section.mobileImage || section.tabletImage || section.desktopImage;

          return (
            <section key={section.id} className="py-16" style={{ order: sectionOrder("customBanner") }}>
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <Link
                  href={section.linkUrl || "/shop"}
                  className="relative block min-h-[320px] overflow-hidden rounded-[2.5rem] p-8 shadow-sm lg:min-h-[420px] lg:p-12"
                  style={{ backgroundColor: section.backgroundColor, color: section.textColor }}
                >
                  {backgroundImage ? (
                    <Image
                      src={backgroundImage}
                      alt={section.title}
                      fill
                      sizes="100vw"
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-black/25" />
                  <div className="relative z-10 flex min-h-[260px] max-w-3xl flex-col justify-center lg:min-h-[360px]">
                    <p className="text-sm font-bold text-brand-gold">
                      <VisualEditableText textKey={`customSection.${section.id}.subtitle`}>
                        {section.subtitle}
                      </VisualEditableText>
                    </p>
                    <h2
                      className="mt-3 font-bold leading-tight"
                      style={{
                        fontSize: `clamp(${section.fontSizeMobile}px, 5vw, ${section.fontSizeDesktop}px)`,
                      }}
                    >
                      <VisualEditableText textKey={`customSection.${section.id}.title`}>
                        {section.title}
                      </VisualEditableText>
                    </h2>
                    <p className="mt-5 max-w-2xl leading-8">
                      <VisualEditableText textKey={`customSection.${section.id}.text`}>
                        {section.text}
                      </VisualEditableText>
                    </p>
                  </div>
                </Link>

                {sectionProducts.length ? (
                  <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {sectionProducts.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}

      {settings.sections.competitiveBanner ? <section className="py-16" style={{ order: sectionOrder("competitiveBanner") }}>
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
              <p className="text-sm font-bold text-brand-gold">
                <VisualEditableText textKey="competitive.eyebrow">ميزة تنافسية</VisualEditableText>
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                <VisualEditableText textKey="competitive.title">
                  موقع أسرع، صفحات منتجات أغنى، وثقة أوضح من الواجهات السريعة
                </VisualEditableText>
              </h2>
              <p className="mt-5 max-w-2xl leading-8 text-zinc-300">
                <VisualEditableText textKey="competitive.description">
                  المرحلة القادمة تضيف البحث السريع، الفلاتر المتقدمة، المفضلة،
                  المقارنة، وربط إتمام الطلب الحقيقي مع ووكومرس وفوري.
                </VisualEditableText>
              </p>
            </div>
            <div className="grid gap-3 text-sm font-bold text-zinc-200">
              {["تحسين ظهور المنتجات في البحث", "بيانات منظمة للمنتج والسعر", "إتمام طلب فوري أو كاش", "تصميم يبدأ من الموبايل"].map(
                (item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <VisualEditableText textKey={`competitive.feature.${item}`}>{item}</VisualEditableText>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section> : null}
    </div>
  );
}
