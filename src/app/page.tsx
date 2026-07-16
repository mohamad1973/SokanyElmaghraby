import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { CategoryScroller } from "@/components/category-scroller";
import { CustomProductSection } from "@/components/custom-product-section";
import { HeroSection } from "@/components/hero-section";
import { MainGroupsSection } from "@/components/main-groups-section";
import { ProductCard } from "@/components/product-card";
import { SectionTitle } from "@/components/section-title";
import { TrustBadgesSection } from "@/components/trust-badges-section";
import { VisualEditableText } from "@/components/visual-editable-text";
import { bannerHorizontalPaddingStyle, bannerSpacingStyle } from "@/lib/banner-spacing";
import { heroSlideHasMedia } from "@/lib/hero-slide-utils";
import { getThemeSettings, type CustomHomeSection, type HomeSectionOrderItem } from "@/lib/theme-settings";
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

function isHomeSectionEnabled(settings: Awaited<ReturnType<typeof getThemeSettings>>, sectionId: HomeSectionOrderItem) {
  return getSectionStyle(settings, sectionId)?.enabled !== false;
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
  const heroSlides = settings.hero.slides.filter(heroSlideHasMedia);
  const heroPaddingStyle = bannerHorizontalPaddingStyle(getSectionStyle(settings, "hero") || { paddingLeft: 0, paddingRight: 0 });
  const heroSectionContainerClass = getSectionContainerClass(settings, "hero");
  const homeSections: HomeSectionEntry[] = [];

  if (settings.hero.enabled && isHomeSectionEnabled(settings, "hero")) {
    homeSections.push({
      id: "hero",
      node: (
        <HeroSection
          hero={settings.hero}
          slides={heroSlides}
          sectionContainerClass={heroSectionContainerClass}
          paddingStyle={heroPaddingStyle}
        />
      ),
    });
  }

  if (
    settings.sections.mainGroups.enabled &&
    isHomeSectionEnabled(settings, "mainGroups") &&
    settings.sections.mainGroups.items.some((item) => item.image)
  ) {
    homeSections.push({
      id: "mainGroups",
      node: <MainGroupsSection section={settings.sections.mainGroups} />,
    });
  }

  if (settings.sections.trustBadges && isHomeSectionEnabled(settings, "trustBadges")) {
    homeSections.push({
      id: "trustBadges",
      node: <TrustBadgesSection items={trustItems} />,
    });
  }

  if (settings.sections.categories.enabled && isHomeSectionEnabled(settings, "categories") && categoriesWithImages.length) {
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
        <CategoryScroller
          categories={categoriesWithImages}
          fullWidth={isFullWidthSection(settings, "categories")}
          settings={settings.sections.categories}
        />
        </section>
      ),
    });
  }

  if (settings.sections.bestSellers && isHomeSectionEnabled(settings, "bestSellers")) {
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
    .filter((section) => section.enabled && isHomeSectionEnabled(settings, getCustomSectionOrderId(section.id)))
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
                    className="relative block min-h-[320px] overflow-hidden rounded-2xl p-8 shadow-sm lg:min-h-[420px] lg:p-12"
                    style={{
                      backgroundColor: section.backgroundColor,
                      color: section.textColor,
                      ...bannerSpacingStyle(section.mainBannerSpacing, { useGapToContent: true }),
                    }}
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

  if (settings.sections.competitiveBanner && isHomeSectionEnabled(settings, "competitiveBanner")) {
    homeSections.push({
      id: "competitiveBanner",
      node: (
        <section className="py-16">
        <div className={getSectionContainerClass(settings, "competitiveBanner")}>
          {settings.sections.customBanner.enabled &&
          isHomeSectionEnabled(settings, "customBanner") &&
          (settings.sections.customBanner.desktopImage || settings.sections.customBanner.mobileImage) ? (
            <Link
              href={settings.sections.customBanner.ctaUrl}
              className="relative block min-h-[260px] overflow-hidden rounded-[2.5rem] bg-zinc-950"
              style={bannerSpacingStyle(settings.sections.customBanner.spacing, { useGapToContent: true })}
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
                <VisualEditableText textKey="competitive.official.eyebrow">سوكاني الرسمية</VisualEditableText>
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                <VisualEditableText textKey="competitive.official.title">
                  ميزة الشراء من الموقع الرسمي لسوكاني
                </VisualEditableText>
              </h2>
            </div>
            <div className="grid gap-3 text-sm font-bold text-zinc-200">
              {[
                {
                  key: "authentic",
                  text: "مصدر موثوق للحصول على منتجات سوكاني الأصلية من مؤسسة المغربي",
                },
                {
                  key: "partsWarranty",
                  text: "قطع غيار أصلية وضمان حقيقي على كل المنتجات",
                },
                {
                  key: "freeDelivery",
                  text: "التوصيل مجاناً لحد باب البيت",
                },
                {
                  key: "afterSales",
                  text: "سرعة خدمة ما بعد البيع",
                },
                {
                  key: "qualityEgypt",
                  text: "نحن نسعى إلى التطوير المستمر لجودة منتجاتنا لتكون ملائمة للسوق المصري وهدفنا رضاء عملائنا",
                },
              ].map((item) => (
                <div key={item.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <VisualEditableText textKey={`competitive.feature.${item.key}`}>{item.text}</VisualEditableText>
                </div>
              ))}
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
