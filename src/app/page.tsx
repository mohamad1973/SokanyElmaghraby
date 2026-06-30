import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { CategoryScroller } from "@/components/category-scroller";
import { CustomProductSection } from "@/components/custom-product-section";
import { ProductCard } from "@/components/product-card";
import { SectionTitle } from "@/components/section-title";
import { VisualEditableText } from "@/components/visual-editable-text";
import { getThemeSettings, type CustomHomeSection, type HomeSectionId, type HomeSectionOrderItem } from "@/lib/theme-settings";
import { getCategories, getFeaturedProducts, getProducts } from "@/lib/woocommerce";

const trustItems = [
  { title: "الوكيل الحصري", text: "منتجات أصلية من مؤسسة المغربي في مصر", icon: "shield" },
  { title: "ضمان عام كامل", text: "ضد عيوب الصناعة مع دعم ما بعد البيع", icon: "check" },
  { title: "دفع مرن", text: "فوري للدفع الإلكتروني أو كاش عند الاستلام", icon: "card" },
  { title: "شحن داخل مصر", text: "تأكيد الطلب قبل الشحن ومتابعة العميل", icon: "truck" },
];

function getCustomSectionProductLimit(section: CustomHomeSection) {
  const highestColumnCount = Math.max(
    section.desktopColumns || 4,
    section.tabletColumns || 2,
    section.mobileColumns || 1,
  );
  const gridLimit = highestColumnCount * (section.rowCount || 1);

  return Math.max(section.productLimit || 4, gridLimit);
}

function getCustomSectionOrderId(sectionId: string): HomeSectionOrderItem {
  return `custom:${sectionId}`;
}

type HomeSectionEntry = {
  id: HomeSectionOrderItem;
  node: ReactNode;
};

function getSectionStyle(settings: Awaited<ReturnType<typeof getThemeSettings>>, sectionId: HomeSectionOrderItem) {
  return settings.homeSectionStyles[sectionId];
}

function getSectionContainerClass(settings: Awaited<ReturnType<typeof getThemeSettings>>, sectionId: HomeSectionOrderItem) {
  return getSectionStyle(settings, sectionId)?.widthMode === "full"
    ? "w-full"
    : "mx-auto max-w-7xl px-4 sm:px-6 lg:px-8";
}

function isFullWidthSection(settings: Awaited<ReturnType<typeof getThemeSettings>>, sectionId: HomeSectionOrderItem) {
  return getSectionStyle(settings, sectionId)?.widthMode === "full";
}

function getSectionFrameStyle(settings: Awaited<ReturnType<typeof getThemeSettings>>, sectionId: HomeSectionOrderItem): CSSProperties {
  const style = getSectionStyle(settings, sectionId);

  if (!style) {
    return {};
  }

  return {
    marginTop: style.spacingTop,
    marginBottom: style.spacingBottom,
    border: style.borderEnabled ? `${style.borderWidth}px solid ${style.borderColor}` : undefined,
    borderRadius: style.borderEnabled ? style.borderRadius : undefined,
    overflow: style.borderEnabled ? "hidden" : undefined,
  };
}

function getGroupFrameStyle(group: Awaited<ReturnType<typeof getThemeSettings>>["homeSectionGroups"][number]): CSSProperties {
  return {
    marginTop: group.spacingTop,
    marginBottom: group.spacingBottom,
    border: group.borderEnabled ? `${group.borderWidth}px solid ${group.borderColor}` : undefined,
    borderRadius: group.borderEnabled ? group.borderRadius : undefined,
    overflow: group.borderEnabled ? "hidden" : undefined,
  };
}

function renderHomeSections(homeSections: HomeSectionEntry[], settings: Awaited<ReturnType<typeof getThemeSettings>>) {
  const sortedSections = [...homeSections].sort((firstSection, secondSection) => {
    const firstOrder = settings.homeSectionsOrder.indexOf(firstSection.id);
    const secondOrder = settings.homeSectionsOrder.indexOf(secondSection.id);

    return (firstOrder === -1 ? 100 : firstOrder) - (secondOrder === -1 ? 100 : secondOrder);
  });
  const renderedSections: ReactNode[] = [];
  const renderedSectionIds = new Set<HomeSectionOrderItem>();
  const groups = settings.homeSectionGroups.filter((group) => group.sectionIds.length > 1);

  for (let index = 0; index < sortedSections.length; index += 1) {
    const currentSection = sortedSections[index];

    if (renderedSectionIds.has(currentSection.id)) {
      continue;
    }

    const matchingGroup = groups.find((group) => {
      if (!group.sectionIds.includes(currentSection.id)) {
        return false;
      }

      const groupSectionSet = new Set(group.sectionIds);
      const adjacentGroupSections = sortedSections.slice(index, index + group.sectionIds.length);

      return adjacentGroupSections.length === group.sectionIds.length &&
        adjacentGroupSections.every((section) => groupSectionSet.has(section.id));
    });

    if (matchingGroup) {
      const groupSectionSet = new Set(matchingGroup.sectionIds);
      const groupedSections = sortedSections.slice(index, index + matchingGroup.sectionIds.length);

      groupedSections.forEach((section) => renderedSectionIds.add(section.id));
      renderedSections.push(
        <div key={matchingGroup.id} style={getGroupFrameStyle(matchingGroup)}>
          {groupedSections
            .filter((section) => groupSectionSet.has(section.id))
            .map((section) => (
              <div key={section.id}>{section.node}</div>
            ))}
        </div>,
      );
      continue;
    }

    renderedSectionIds.add(currentSection.id);
    renderedSections.push(
      <div key={currentSection.id} style={getSectionFrameStyle(settings, currentSection.id)}>
        {currentSection.node}
      </div>,
    );
  }

  return renderedSections;
}

export const dynamic = "force-dynamic";

function TrustIcon({ icon }: { icon: string }) {
  const className = "h-9 w-9";

  if (icon === "check") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M12 3.2 19.2 6.4v5.4c0 4.1-2.5 6.9-7.2 8.8-4.7-1.9-7.2-4.7-7.2-8.8V6.4L12 3.2Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.7 12.1 11 14.4 15.7 9.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.4 6.8 12 5.3l3.6 1.5" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  if (icon === "card") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M4.5 6.8h15A2.2 2.2 0 0 1 21.7 9v7.8a2.2 2.2 0 0 1-2.2 2.2h-15a2.2 2.2 0 0 1-2.2-2.2V9a2.2 2.2 0 0 1 2.2-2.2Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2.7 11.1h18.6M6.2 15.8h4.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16.2 15.7h2.4" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  if (icon === "truck") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M3 7.2h10.8v8.4H3V7.2ZM13.8 10.2h3.8l3.4 3.2v2.2h-7.2v-5.4Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 18.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM17.7 18.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 4.8h6.8M4 11.3h5.2" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 3.3 19 6.7v5.1c0 4.3-2.4 7-7 8.9-4.6-1.9-7-4.6-7-8.9V6.7L12 3.3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12.4 11.2 14.6 15.7 10.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.6 7.7 12 5.6l4.4 2.1" strokeLinecap="round" opacity="0.55" />
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
        section.categorySlug ? await getProducts(getCustomSectionProductLimit(section), section.categorySlug) : [],
      ] as const),
    ),
  );
  const heroHasImage = Boolean(
    settings.hero.desktopImage || settings.hero.tabletImage || settings.hero.mobileImage,
  );
  const heroTextClass = settings.hero.textTone === "dark" ? "text-zinc-950" : "text-white";
  const heroSubtextClass = settings.hero.textTone === "dark" ? "text-zinc-700" : "text-white/85";
  const heroContentJustifyClass = {
    right: "sm:justify-end",
    center: "sm:justify-center",
    left: "sm:justify-start",
  }[settings.hero.contentAlign];
  const heroMobileContentJustifyClass = {
    right: "justify-end",
    center: "justify-center",
    left: "justify-start",
  }[settings.hero.mobileContentAlign];
  const heroContentTextAlignClass = {
    right: "sm:text-right sm:items-end",
    center: "sm:text-center sm:items-center",
    left: "sm:text-left sm:items-start",
  }[settings.hero.contentAlign];
  const heroMobileContentTextAlignClass = {
    right: "text-right items-end",
    center: "text-center items-center",
    left: "text-left items-start",
  }[settings.hero.mobileContentAlign];
  const heroButtonAlignClass = {
    right: "sm:justify-end",
    center: "sm:justify-center",
    left: "sm:justify-start",
  }[settings.hero.contentAlign];
  const heroMobileButtonAlignClass = {
    right: "justify-end",
    center: "justify-center",
    left: "justify-start",
  }[settings.hero.mobileContentAlign];
  const shouldRenderHeroText = settings.hero.showTextOnMobile || settings.hero.showTextOnDesktop;
  const heroTextVisibilityClass = settings.hero.showTextOnMobile
    ? settings.hero.showTextOnDesktop
      ? "flex"
      : "flex sm:hidden"
    : "hidden sm:flex";
  const heroMobileStyle = {
    "--hero-mobile-title-size": `${settings.hero.mobileTitleFontSize}px`,
    "--hero-mobile-subtitle-size": `${settings.hero.mobileSubtitleFontSize}px`,
    "--hero-mobile-button-size": `${settings.hero.mobileButtonFontSize}px`,
    "--hero-mobile-button-px": `${settings.hero.mobileButtonPaddingX}px`,
    "--hero-mobile-button-py": `${settings.hero.mobileButtonPaddingY}px`,
  } as CSSProperties;
  const homeSections: HomeSectionEntry[] = [];

  if (settings.hero.enabled) {
    homeSections.push({
      id: "hero",
      node: heroHasImage ? (
        <section className="relative min-h-[640px] overflow-hidden bg-zinc-950">
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
              className={`relative flex min-h-[640px] items-center py-24 ${getSectionContainerClass(settings, "hero")} ${heroMobileContentJustifyClass} ${heroContentJustifyClass}`}
              style={heroMobileStyle}
            >
              {shouldRenderHeroText ? (
                <div
                  className={`${heroTextVisibilityClass} max-w-3xl flex-col ${heroMobileContentTextAlignClass} ${heroContentTextAlignClass} ${settings.hero.frameEnabled ? "rounded-[2rem] border border-white/20 bg-black/25 p-8 backdrop-blur-sm" : ""}`}
                >
                  <p className="mb-5 inline-flex w-fit rounded-full bg-brand-gold px-4 py-2 text-sm font-bold text-black">
                    <VisualEditableText textKey="hero.eyebrow">{settings.hero.eyebrow}</VisualEditableText>
                  </p>
                  <h1 className={`text-[length:var(--hero-mobile-title-size)] font-bold leading-tight tracking-tight sm:text-6xl ${heroTextClass}`}>
                    <VisualEditableText textKey="hero.title">{settings.hero.title}</VisualEditableText>
                  </h1>
                  <p className={`mt-6 max-w-2xl text-[length:var(--hero-mobile-subtitle-size)] leading-8 sm:text-lg sm:leading-9 ${heroSubtextClass}`}>
                    <VisualEditableText textKey="hero.subtitle">{settings.hero.subtitle}</VisualEditableText>
                  </p>
                  <div className={`mt-9 flex w-full flex-col gap-3 sm:flex-row ${heroMobileButtonAlignClass} ${heroButtonAlignClass}`}>
                    <Link
                      href={settings.hero.primaryCtaUrl}
                      className="rounded-full bg-brand-gold px-[var(--hero-mobile-button-px)] py-[var(--hero-mobile-button-py)] text-center text-[length:var(--hero-mobile-button-size)] font-bold text-black transition hover:bg-brand-gold-dark sm:px-8 sm:py-4 sm:text-sm"
                    >
                      <VisualEditableText textKey="hero.primaryCtaText">{settings.hero.primaryCtaText}</VisualEditableText>
                    </Link>
                    <Link
                      href={settings.hero.secondaryCtaUrl}
                      className="rounded-full border border-white/30 bg-white/10 px-[var(--hero-mobile-button-px)] py-[var(--hero-mobile-button-py)] text-center text-[length:var(--hero-mobile-button-size)] font-bold text-white transition hover:border-brand-gold hover:text-brand-gold sm:px-8 sm:py-4 sm:text-sm"
                    >
                      <VisualEditableText textKey="hero.secondaryCtaText">{settings.hero.secondaryCtaText}</VisualEditableText>
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
      ) : (
        <section className="relative overflow-hidden bg-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(218,255,0,0.34),_transparent_34%),linear-gradient(135deg,_rgba(0,0,0,0.04),_transparent_45%)]" />
            <div
              className={`relative py-20 lg:py-28 ${getSectionContainerClass(settings, "hero")}`}
              style={heroMobileStyle}
            >
              {shouldRenderHeroText ? (
                <div className={`${heroTextVisibilityClass} flex-col ${heroMobileContentTextAlignClass} ${heroContentTextAlignClass}`}>
                  <p className="mb-5 inline-flex w-fit rounded-full border border-brand-gold/40 bg-brand-cream px-4 py-2 text-sm font-medium text-zinc-950">
                    <VisualEditableText textKey="hero.eyebrow">{settings.hero.eyebrow}</VisualEditableText>
                  </p>
                  <h1 className="max-w-4xl text-[length:var(--hero-mobile-title-size)] font-bold leading-tight tracking-tight text-zinc-950 sm:text-6xl">
                    <VisualEditableText textKey="hero.title">{settings.hero.title}</VisualEditableText>
                  </h1>
                  <p className="mt-6 max-w-2xl text-[length:var(--hero-mobile-subtitle-size)] leading-8 text-zinc-600 sm:text-lg sm:leading-9">
                    <VisualEditableText textKey="hero.subtitle">{settings.hero.subtitle}</VisualEditableText>
                  </p>
                </div>
              ) : null}
            </div>
          </section>
      ),
    });
  }

  if (settings.sections.trustBadges) {
    homeSections.push({
      id: "trustBadges",
      node: (
        <section className="bg-white py-8">
        <div className={getSectionContainerClass(settings, "trustBadges")}>
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl">
            <div className="flex gap-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] lg:grid lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
              {trustItems.map((item, index) => (
                <div
                  key={item.title}
                  className="flex min-w-[78%] items-center gap-4 border-l border-white/10 p-5 last:border-l-0 sm:min-w-[48%] lg:min-w-0 lg:p-6"
                >
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-brand-gold/20 bg-brand-gold/10 text-brand-gold shadow-[0_0_30px_rgba(218,255,0,0.08)]">
                    <TrustIcon icon={item.icon} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-extrabold text-white">
                      <VisualEditableText textKey={`trust.${item.icon}.title`}>{item.title}</VisualEditableText>
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                      <VisualEditableText textKey={`trust.${item.icon}.text`}>{item.text}</VisualEditableText>
                    </p>
                    <span className="mt-3 block h-0.5 w-10 rounded-full bg-brand-gold/70 lg:hidden" />
                  </div>
                  <span className="pointer-events-none mr-auto hidden text-4xl font-black text-white/5 lg:block">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        </section>
      ),
    });
  }

  if (settings.sections.categories && categoriesWithImages.length) {
    homeSections.push({
      id: "categories",
      node: (
        <section className="overflow-hidden py-16">
        <div className={getSectionContainerClass(settings, "categories")}>
          <SectionTitle
            textKeyPrefix="home.categories"
            eyebrow="التصنيفات"
            title="تسوق حسب التصنيف"
            description="يمكنك الوصول الى المنتج الذى تريده عن طريق الضغط على القسم الذى ينتمى اليه"
          />
        </div>
        <CategoryScroller categories={categoriesWithImages} fullWidth={isFullWidthSection(settings, "categories")} />
        </section>
      ),
    });
  }

  if (settings.sections.bestSellers) {
    homeSections.push({
      id: "bestSellers",
      node: (
        <section className="bg-white py-16">
        <div className={getSectionContainerClass(settings, "bestSellers")}>
          <SectionTitle
            textKeyPrefix="home.bestSellers"
            eyebrow="الأكثر طلباً"
            title="الأكثر مبيعاً"
            description="تعرف على اكثر المنتجات مبيعا لدى العملاء."
          />
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
        </section>
      ),
    });
  }

  settings.customSections
    .filter((section) => section.enabled)
    .forEach((section) => {
      const sectionProducts = customSectionProducts.get(section.id) || [];
      const backgroundImage = section.mobileImage || section.tabletImage || section.desktopImage;

      homeSections.push({
        id: getCustomSectionOrderId(section.id),
        node: (
          <section className="py-16">
              <div className={getSectionContainerClass(settings, getCustomSectionOrderId(section.id))}>
                {section.showMainBanner ? (
                  <Link
                    href={section.linkUrl || "/shop"}
                    className="relative mb-8 block min-h-[320px] overflow-hidden rounded-2xl p-8 shadow-sm lg:min-h-[420px] lg:p-12"
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
                      <h2
                        className="font-bold leading-tight"
                        style={{
                          fontSize: `clamp(${section.fontSizeMobile}px, 5vw, ${section.fontSizeDesktop}px)`,
                        }}
                      >
                        <VisualEditableText textKey={`customSection.${section.id}.mainBannerTitle`}>
                          {section.title}
                        </VisualEditableText>
                      </h2>
                      {section.text ? (
                        <p className="mt-5 max-w-2xl leading-8">
                          <VisualEditableText textKey={`customSection.${section.id}.text`}>
                            {section.text}
                          </VisualEditableText>
                        </p>
                      ) : null}
                    </div>
                  </Link>
                ) : null}

                {sectionProducts.length ? <CustomProductSection section={section} products={sectionProducts} /> : null}
              </div>
            </section>
        ),
      });
    });

  if (settings.sections.competitiveBanner) {
    homeSections.push({
      id: "competitiveBanner",
      node: (
        <section className="py-16">
        <div className={getSectionContainerClass(settings, "competitiveBanner")}>
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
              {[
                { key: "search", text: "تحسين ظهور المنتجات في البحث" },
                { key: "structuredData", text: "بيانات منظمة للمنتج والسعر" },
                { key: "checkout", text: "إتمام طلب فوري أو كاش" },
                { key: "mobile", text: "تصميم يبدأ من الموبايل" },
              ].map(
                (item) => (
                  <div key={item.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <VisualEditableText textKey={`competitive.feature.${item.key}`}>{item.text}</VisualEditableText>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
        </section>
      ),
    });
  }

  return (
    <div>
      {renderHomeSections(homeSections, settings)}
    </div>
  );
}
