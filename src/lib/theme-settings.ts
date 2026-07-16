import "server-only";

import type { CSSProperties } from "react";

import { defaultBannerSpacing, defaultSideBannerSpacing, mergeBannerSpacing, type BannerSpacing } from "./banner-spacing";
import type { ProductCodeMode } from "./product-display-code";
import { getPrismaClient } from "./db";
import {
  clampPlacement,
  mergeResponsiveWidgetPlacement,
} from "./widget-placement";

export type { BannerSpacing };
export { defaultBannerSpacing, defaultSideBannerSpacing, mergeBannerSpacing };
export type { ProductCodeMode };

export type MenuItem = {
  label: string;
  href: string;
};

export type VisualTextAlign = "right" | "center" | "left" | "inherit";

export type VisualTextDeviceStyle = {
  x: number;
  y: number;
  fontSizeDelta: number;
  align: VisualTextAlign;
};

export type VisualTextStyle = {
  desktop?: Partial<VisualTextDeviceStyle>;
  mobile?: Partial<VisualTextDeviceStyle>;
  x?: number;
  y?: number;
  fontSizeDelta?: number;
  align?: VisualTextAlign;
};

export type HomeSectionId = "hero" | "mainGroups" | "trustBadges" | "categories" | "bestSellers" | "customBanner" | "competitiveBanner";
export type HomeSectionOrderItem = HomeSectionId | `custom:${string}`;

export type HomeSectionStyle = {
  enabled: boolean;
  spacingTop: number;
  spacingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  widthMode: "contained" | "full";
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  groupId: string;
};

export type HomeSectionGroupStyle = {
  id: string;
  label: string;
  sectionIds: HomeSectionOrderItem[];
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  spacingTop: number;
  spacingBottom: number;
};

export type CustomHomeSectionDisplayMode = "grid" | "carousel";
export type CustomHomeSectionType = "bannerWithProducts";
export type CustomHomeSectionSideBannerPosition = "left" | "right";

export type CustomHomeSection = {
  id: string;
  enabled: boolean;
  sectionType: CustomHomeSectionType;
  showMainBanner: boolean;
  mainBannerSpacing: BannerSpacing;
  title: string;
  subtitle: string;
  text: string;
  backgroundColor: string;
  textColor: string;
  linkUrl: string;
  desktopImage: string;
  tabletImage: string;
  mobileImage: string;
  categorySlug: string;
  productLimit: number;
  desktopColumns: number;
  tabletColumns: number;
  mobileColumns: number;
  rowCount: number;
  displayMode: CustomHomeSectionDisplayMode;
  sideBanner: {
    enabled: boolean;
    image: string;
    linkUrl: string;
    position: CustomHomeSectionSideBannerPosition;
    showOnMobile: boolean;
    spacing: BannerSpacing;
  };
  fontSizeDesktop: number;
  fontSizeTablet: number;
  fontSizeMobile: number;
};

export type TopBannerTextAnimation = "marquee" | "static";
export type HeroLayoutMode = "full" | "split";
export type HeroMediaType = "image" | "video";

export type HeroSlide = {
  id: string;
  mediaType: HeroMediaType;
  desktopImage: string;
  tabletImage: string;
  mobileImage: string;
  desktopVideo: string;
  tabletVideo: string;
  mobileVideo: string;
  linkUrl: string;
};

export type HeroSideBanner = {
  id: string;
  image: string;
  linkUrl: string;
};


export function createDefaultHeroSideBanners(): [HeroSideBanner, HeroSideBanner] {
  return [
    { id: "hero-side-1", image: "", linkUrl: "" },
    { id: "hero-side-2", image: "", linkUrl: "" },
  ];
}

export type MainGroupItem = {
  id: string;
  image: string;
  linkUrl: string;
  alt: string;
};

export type MainGroupsSectionSettings = {
  enabled: boolean;
  items: [MainGroupItem, MainGroupItem, MainGroupItem];
};

export function createDefaultMainGroupItems(): [MainGroupItem, MainGroupItem, MainGroupItem] {
  return [
    { id: "main-group-1", image: "", linkUrl: "", alt: "" },
    { id: "main-group-2", image: "", linkUrl: "", alt: "" },
    { id: "main-group-3", image: "", linkUrl: "", alt: "" },
  ];
}

export type WidgetButtonShape = "circle" | "square";

export type WidgetButtonStyle = {
  size: number;
  backgroundColor: string;
  hoverBackgroundColor: string;
  iconColor: string;
  shape: WidgetButtonShape;
  borderRadius: number;
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
};

export function createDefaultWidgetButtonStyle(size: number): WidgetButtonStyle {
  return {
    size,
    backgroundColor: "#daff00",
    hoverBackgroundColor: "#c1e200",
    iconColor: "#000000",
    shape: "circle",
    borderRadius: 12,
    borderEnabled: false,
    borderColor: "#000000",
    borderWidth: 1,
  };
}

export type CategoriesSectionSettings = {
  enabled: boolean;
  desktopVisibleCount: number;
  tabletVisibleCount: number;
  mobileVisibleCount: number;
  carouselIntervalSeconds: number;
};

export type WidgetPlacement = {
  bottom: number;
  inset: number;
};

export type ResponsiveWidgetPlacement = {
  desktop: WidgetPlacement;
  mobile: WidgetPlacement;
};

export type DesktopSidebarPlacement = {
  topPercent: number;
  inset: number;
};

export type MobileLauncherPlacement = {
  bottom: number;
  inset: number;
};

export type SocialMediaSettings = {
  enabled: boolean;
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  buttonStyle: WidgetButtonStyle;
  mobileLauncherStyle: WidgetButtonStyle;
  desktopSidebarPlacement: DesktopSidebarPlacement;
  mobileLauncherPlacement: MobileLauncherPlacement;
};

export type FloatingActionsSettings = {
  whatsappEnabled: boolean;
  whatsappPhone: string;
  scrollTopEnabled: boolean;
  whatsappStyle: WidgetButtonStyle;
  scrollTopStyle: WidgetButtonStyle;
  whatsappPlacement: ResponsiveWidgetPlacement;
  scrollTopPlacement: ResponsiveWidgetPlacement;
};

export type ThemeSettings = {
  brand: {
    logoUrl: string;
    logoText: string;
    tagline: string;
    logoDesktopWidth: number;
    logoDesktopHeight: number;
    logoMobileWidth: number;
    logoMobileHeight: number;
    primaryColor: string;
    primaryColorDark: string;
    backgroundColor: string;
    fontFamily: string;
  };
  topBanner: {
    enabled: boolean;
    text: string;
    url: string;
    desktopImage: string;
    mobileImage: string;
    speedSeconds: number;
    gapMode: "continuous" | "spaced";
    gapWidth: number;
    textAnimation: TopBannerTextAnimation;
    spacing: BannerSpacing;
  };
  header: {
    ctaText: string;
    ctaUrl: string;
    showCart: boolean;
    mobileShowSearch: boolean;
    mobileShowCart: boolean;
  };
  navigation: MenuItem[];
  hero: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCtaText: string;
    primaryCtaUrl: string;
    secondaryCtaText: string;
    secondaryCtaUrl: string;
    desktopImage: string;
    tabletImage: string;
    mobileImage: string;
    textTone: "light" | "dark";
    overlayEnabled: boolean;
    frameEnabled: boolean;
    showTextOnMobile: boolean;
    showTextOnDesktop: boolean;
    contentAlign: "right" | "center" | "left";
    mobileContentAlign: "right" | "center" | "left";
    mobileTitleFontSize: number;
    mobileSubtitleFontSize: number;
    mobileButtonFontSize: number;
    mobileButtonPaddingX: number;
    mobileButtonPaddingY: number;
    slides: HeroSlide[];
    carouselIntervalSeconds: number;
    layoutMode: HeroLayoutMode;
    sideBanners: [HeroSideBanner, HeroSideBanner];
  };
  sections: {
    trustBadges: boolean;
    mainGroups: MainGroupsSectionSettings;
    categories: CategoriesSectionSettings;
    bestSellers: boolean;
    competitiveBanner: boolean;
    customBanner: {
      enabled: boolean;
      title: string;
      desktopImage: string;
      tabletImage: string;
      mobileImage: string;
      ctaText: string;
      ctaUrl: string;
      spacing: BannerSpacing;
    };
  };
  footer: {
    description: string;
    copyright: string;
  };
  socialMedia: SocialMediaSettings;
  floatingActions: FloatingActionsSettings;
  productCard: {
    borderWidth: number;
    borderRadius: number;
    codeMode: ProductCodeMode;
  };
  homeSectionsOrder: HomeSectionOrderItem[];
  homeSectionStyles: Record<string, HomeSectionStyle>;
  homeSectionGroups: HomeSectionGroupStyle[];
  customSections: CustomHomeSection[];
  visualEditor: {
    enabled: boolean;
  };
  visualTextStyles: Record<string, VisualTextStyle>;
  visualTextContent: Record<string, string>;
};

export const defaultHomeSectionsOrder: HomeSectionOrderItem[] = [
  "hero",
  "mainGroups",
  "trustBadges",
  "categories",
  "bestSellers",
  "customBanner",
  "competitiveBanner",
];

export const defaultThemeSettings: ThemeSettings = {
  brand: {
    logoUrl: "",
    logoText: "SOKANY",
    tagline: "مؤسسة المغربي",
    logoDesktopWidth: 144,
    logoDesktopHeight: 48,
    logoMobileWidth: 96,
    logoMobileHeight: 40,
    primaryColor: "#DAFF00",
    primaryColorDark: "#C1E200",
    backgroundColor: "#F4F5F2",
    fontFamily: "Almarai",
  },
  topBanner: {
    enabled: true,
    text: "منتجات عالية الجودة\nتوصيل سريع لجميع المحافظات\nأسعار تنافسية وعروض مميزة\nدفع آمن ومضمون 100%\nخدمة عملاء متميزة 24/7\nضمان على جميع المنتجات",
    url: "/shop",
    desktopImage: "",
    mobileImage: "",
    speedSeconds: 40,
    gapMode: "continuous",
    gapWidth: 160,
    textAnimation: "marquee",
    spacing: defaultBannerSpacing,
  },
  header: {
    ctaText: "اطلب الآن",
    ctaUrl: "/checkout",
    showCart: true,
    mobileShowSearch: true,
    mobileShowCart: true,
  },
  navigation: [
    { href: "/", label: "الرئيسية" },
    { href: "/shop", label: "المتجر" },
    { href: "/offers", label: "العروض" },
    { href: "/warranty", label: "الضمان" },
    { href: "/contact", label: "تواصل معنا" },
  ],
  hero: {
    enabled: true,
    eyebrow: "مؤسسة المغربي الوكيل الحصري لسوكاني في مصر",
    title: "سوكاني الأصلية بضمان رسمي وتجربة شراء أسرع من أي متجر تقليدي",
    subtitle: "واجهة حديثة مستوحاة من الشركة الأم، مصممة للبيع في مصر: منتجات أصلية، دفع فوري أو كاش، شحن داخل الجمهورية، وصفحات منتجات غنية بالمواصفات.",
    primaryCtaText: "تسوق المنتجات",
    primaryCtaUrl: "/shop",
    secondaryCtaText: "تواصل مع خدمة العملاء",
    secondaryCtaUrl: "/contact",
    desktopImage: "",
    tabletImage: "",
    mobileImage: "",
    textTone: "light",
    overlayEnabled: true,
    frameEnabled: false,
    showTextOnMobile: true,
    showTextOnDesktop: true,
    contentAlign: "right",
    mobileContentAlign: "right",
    mobileTitleFontSize: 34,
    mobileSubtitleFontSize: 16,
    mobileButtonFontSize: 14,
    mobileButtonPaddingX: 20,
    mobileButtonPaddingY: 12,
    slides: [
      {
        id: "hero-slide-1",
        mediaType: "image",
        desktopImage: "",
        tabletImage: "",
        mobileImage: "",
        desktopVideo: "",
        tabletVideo: "",
        mobileVideo: "",
        linkUrl: "",
      },
    ],
    carouselIntervalSeconds: 6,
    layoutMode: "full",
    sideBanners: createDefaultHeroSideBanners(),
  },
  sections: {
    trustBadges: true,
    mainGroups: {
      enabled: true,
      items: createDefaultMainGroupItems(),
    },
    categories: {
      enabled: true,
      desktopVisibleCount: 10,
      tabletVisibleCount: 6,
      mobileVisibleCount: 4,
      carouselIntervalSeconds: 3,
    },
    bestSellers: true,
    competitiveBanner: true,
    customBanner: {
      enabled: false,
      title: "عرض خاص من سوكاني",
      desktopImage: "",
      tabletImage: "",
      mobileImage: "",
      ctaText: "تسوق الآن",
      ctaUrl: "/offers",
      spacing: defaultBannerSpacing,
    },
  },
  footer: {
    description:
      "تجربة شراء مباشرة لمنتجات سوكاني الأصلية بضمان لمدة عام ضد عيوب الصناعة وخدمة شحن داخل محافظات الجمهورية.",
    copyright: "SOKANY. جميع الحقوق محفوظة.",
  },
  socialMedia: {
    enabled: true,
    facebookUrl: "",
    instagramUrl: "",
    tiktokUrl: "",
    buttonStyle: createDefaultWidgetButtonStyle(44),
    mobileLauncherStyle: createDefaultWidgetButtonStyle(44),
    desktopSidebarPlacement: {
      topPercent: 50,
      inset: 16,
    },
    mobileLauncherPlacement: {
      bottom: 80,
      inset: 16,
    },
  },
  floatingActions: {
    whatsappEnabled: true,
    whatsappPhone: "01101115311",
    scrollTopEnabled: true,
    whatsappStyle: createDefaultWidgetButtonStyle(56),
    scrollTopStyle: createDefaultWidgetButtonStyle(48),
    whatsappPlacement: {
      desktop: { bottom: 24, inset: 24 },
      mobile: { bottom: 96, inset: 24 },
    },
    scrollTopPlacement: {
      desktop: { bottom: 92, inset: 24 },
      mobile: { bottom: 164, inset: 24 },
    },
  },
  productCard: {
    borderWidth: 1,
    borderRadius: 0,
    codeMode: "titleSk",
  },
  homeSectionsOrder: defaultHomeSectionsOrder,
  homeSectionStyles: {},
  homeSectionGroups: [],
  customSections: [],
  visualEditor: {
    enabled: false,
  },
  visualTextStyles: {},
  visualTextContent: {},
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getCustomSectionOrderId(sectionId: string): HomeSectionOrderItem {
  return `custom:${sectionId}`;
}

function mergeHomeSectionsOrder(value: unknown, customSections: CustomHomeSection[]) {
  const customOrderItems = customSections.map((section) => getCustomSectionOrderId(section.id));
  const allowedSections = new Set<HomeSectionOrderItem>([
    ...defaultHomeSectionsOrder,
    ...customOrderItems,
  ]);

  if (!Array.isArray(value)) {
    const customBannerIndex = defaultThemeSettings.homeSectionsOrder.indexOf("customBanner");
    const nextOrder = [...defaultThemeSettings.homeSectionsOrder];
    nextOrder.splice(customBannerIndex + 1, 0, ...customOrderItems);

    return nextOrder;
  }

  const selectedSections = value.filter((section): section is HomeSectionOrderItem =>
    typeof section === "string" && allowedSections.has(section as HomeSectionOrderItem),
  );
  const uniqueSelectedSections = [...new Set(selectedSections)];
  const missingDefaultSections = defaultHomeSectionsOrder.filter((section) => !uniqueSelectedSections.includes(section));
  const missingCustomSections = customOrderItems.filter((section) => !uniqueSelectedSections.includes(section));

  return [...uniqueSelectedSections, ...missingDefaultSections, ...missingCustomSections];
}

function mergeHomeSectionStyle(value: unknown): HomeSectionStyle {
  const style = isObject(value) ? value : {};

  return {
    enabled: typeof style.enabled === "boolean" ? style.enabled : true,
    spacingTop: typeof style.spacingTop === "number" ? Math.max(0, style.spacingTop) : 64,
    spacingBottom: typeof style.spacingBottom === "number" ? Math.max(0, style.spacingBottom) : 64,
    paddingLeft: typeof style.paddingLeft === "number" ? Math.max(0, Math.min(200, style.paddingLeft)) : 0,
    paddingRight: typeof style.paddingRight === "number" ? Math.max(0, Math.min(200, style.paddingRight)) : 0,
    widthMode: style.widthMode === "full" ? "full" : "contained",
    borderEnabled: typeof style.borderEnabled === "boolean" ? style.borderEnabled : false,
    borderColor: typeof style.borderColor === "string" ? style.borderColor : "#111111",
    borderWidth: typeof style.borderWidth === "number" ? Math.max(0, style.borderWidth) : 1,
    borderRadius: typeof style.borderRadius === "number" ? Math.max(0, style.borderRadius) : 24,
    groupId: typeof style.groupId === "string" ? style.groupId : "",
  };
}

function mergeHomeSectionStyles(value: unknown, homeSectionsOrder: HomeSectionOrderItem[]) {
  const styles = isObject(value) ? value : {};

  return Object.fromEntries(
    homeSectionsOrder.map((sectionId) => [
      sectionId,
      mergeHomeSectionStyle(styles[sectionId]),
    ]),
  ) as Record<string, HomeSectionStyle>;
}

function mergeHomeSectionGroups(value: unknown, homeSectionsOrder: HomeSectionOrderItem[]): HomeSectionGroupStyle[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedSectionIds = new Set(homeSectionsOrder);

  return value.filter(isObject).map((group, index) => ({
    id: typeof group.id === "string" ? group.id : `group-${index + 1}`,
    label: typeof group.label === "string" ? group.label : `مجموعة ${index + 1}`,
    sectionIds: Array.isArray(group.sectionIds)
      ? group.sectionIds.filter((sectionId): sectionId is HomeSectionOrderItem =>
          typeof sectionId === "string" && allowedSectionIds.has(sectionId as HomeSectionOrderItem),
        )
      : [],
    borderEnabled: typeof group.borderEnabled === "boolean" ? group.borderEnabled : true,
    borderColor: typeof group.borderColor === "string" ? group.borderColor : "#111111",
    borderWidth: typeof group.borderWidth === "number" ? Math.max(0, group.borderWidth) : 1,
    borderRadius: typeof group.borderRadius === "number" ? Math.max(0, group.borderRadius) : 24,
    spacingTop: typeof group.spacingTop === "number" ? Math.max(0, group.spacingTop) : 64,
    spacingBottom: typeof group.spacingBottom === "number" ? Math.max(0, group.spacingBottom) : 64,
  }));
}

function mergeCustomSections(value: unknown): CustomHomeSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isObject).map((section, index) => {
    const desktopImage = typeof section.desktopImage === "string" ? section.desktopImage : "";
    const tabletImage = typeof section.tabletImage === "string" ? section.tabletImage : "";
    const mobileImage = typeof section.mobileImage === "string" ? section.mobileImage : "";
    const sideBanner = isObject(section.sideBanner) ? section.sideBanner : {};
    const hasMainBannerImage = Boolean(desktopImage || tabletImage || mobileImage);

    return {
      id: typeof section.id === "string" ? section.id : `custom-section-${index + 1}`,
      enabled: typeof section.enabled === "boolean" ? section.enabled : true,
      sectionType: section.sectionType === "bannerWithProducts" ? "bannerWithProducts" : "bannerWithProducts",
      showMainBanner: typeof section.showMainBanner === "boolean" ? section.showMainBanner : hasMainBannerImage,
      mainBannerSpacing: mergeBannerSpacing(section.mainBannerSpacing),
      title: typeof section.title === "string" ? section.title : "سكشن مخصص",
      subtitle: typeof section.subtitle === "string" ? section.subtitle : "",
      text: typeof section.text === "string" ? section.text : "",
      backgroundColor: typeof section.backgroundColor === "string" ? section.backgroundColor : "#101010",
      textColor: typeof section.textColor === "string" ? section.textColor : "#ffffff",
      linkUrl: typeof section.linkUrl === "string" ? section.linkUrl : "/shop",
      desktopImage,
      tabletImage,
      mobileImage,
      categorySlug: typeof section.categorySlug === "string" ? section.categorySlug : "",
      productLimit: typeof section.productLimit === "number" ? section.productLimit : 4,
      desktopColumns: typeof section.desktopColumns === "number" ? section.desktopColumns : 4,
      tabletColumns: typeof section.tabletColumns === "number" ? section.tabletColumns : 2,
      mobileColumns: typeof section.mobileColumns === "number" ? section.mobileColumns : 2,
      rowCount: typeof section.rowCount === "number" ? section.rowCount : 1,
      displayMode: section.displayMode === "carousel" ? "carousel" : "grid",
      sideBanner: {
        enabled: typeof sideBanner.enabled === "boolean" ? sideBanner.enabled : false,
        image: typeof sideBanner.image === "string" ? sideBanner.image : "",
        linkUrl: typeof sideBanner.linkUrl === "string" ? sideBanner.linkUrl : "",
        position: sideBanner.position === "left" ? "left" : "right",
        showOnMobile: typeof sideBanner.showOnMobile === "boolean" ? sideBanner.showOnMobile : false,
        spacing: mergeBannerSpacing(sideBanner.spacing, defaultSideBannerSpacing),
      },
      fontSizeDesktop: typeof section.fontSizeDesktop === "number" ? section.fontSizeDesktop : 56,
      fontSizeTablet: typeof section.fontSizeTablet === "number" ? section.fontSizeTablet : 42,
      fontSizeMobile: typeof section.fontSizeMobile === "number" ? section.fontSizeMobile : 32,
    };
  });
}

function mergeBrandSettings(value: unknown): ThemeSettings["brand"] {
  const brand = isObject(value) ? value : {};

  return {
    ...defaultThemeSettings.brand,
    ...brand,
    logoDesktopWidth:
      typeof brand.logoDesktopWidth === "number" ? Math.max(1, brand.logoDesktopWidth) : defaultThemeSettings.brand.logoDesktopWidth,
    logoDesktopHeight:
      typeof brand.logoDesktopHeight === "number" ? Math.max(1, brand.logoDesktopHeight) : defaultThemeSettings.brand.logoDesktopHeight,
    logoMobileWidth:
      typeof brand.logoMobileWidth === "number" ? Math.max(1, brand.logoMobileWidth) : defaultThemeSettings.brand.logoMobileWidth,
    logoMobileHeight:
      typeof brand.logoMobileHeight === "number" ? Math.max(1, brand.logoMobileHeight) : defaultThemeSettings.brand.logoMobileHeight,
  };
}

function mergeTopBannerSettings(value: unknown): ThemeSettings["topBanner"] {
  const topBanner = isObject(value) ? value : {};
  const speedSeconds = typeof topBanner.speedSeconds === "number" ? topBanner.speedSeconds : defaultThemeSettings.topBanner.speedSeconds;
  const gapWidth = typeof topBanner.gapWidth === "number" ? topBanner.gapWidth : defaultThemeSettings.topBanner.gapWidth;

  return {
    ...defaultThemeSettings.topBanner,
    ...topBanner,
    speedSeconds: Math.min(120, Math.max(10, speedSeconds)),
    gapMode: topBanner.gapMode === "spaced" ? "spaced" : "continuous",
    gapWidth: Math.min(1000, Math.max(0, gapWidth)),
    textAnimation: topBanner.textAnimation === "static" ? "static" : "marquee",
    spacing: mergeBannerSpacing(topBanner.spacing),
  };
}

function mergeCustomBannerSettings(value: unknown): ThemeSettings["sections"]["customBanner"] {
  const customBanner = isObject(value) ? value : {};

  return {
    ...defaultThemeSettings.sections.customBanner,
    ...customBanner,
    spacing: mergeBannerSpacing(customBanner.spacing),
  };
}

function mergeMainGroupItem(value: unknown, index: number): MainGroupItem {
  const item = isObject(value) ? value : {};

  return {
    id: typeof item.id === "string" ? item.id : `main-group-${index + 1}`,
    image: typeof item.image === "string" ? item.image : "",
    linkUrl: typeof item.linkUrl === "string" ? item.linkUrl : "",
    alt: typeof item.alt === "string" ? item.alt : "",
  };
}

function mergeMainGroupsSettings(value: unknown): ThemeSettings["sections"]["mainGroups"] {
  const mainGroups = isObject(value) ? value : {};
  const mergedItems = Array.isArray(mainGroups.items)
    ? mainGroups.items.filter(isObject).map((item, index) => mergeMainGroupItem(item, index))
    : [];
  const defaultItems = createDefaultMainGroupItems();

  while (mergedItems.length < 3) {
    mergedItems.push(defaultItems[mergedItems.length]);
  }

  return {
    ...defaultThemeSettings.sections.mainGroups,
    ...mainGroups,
    enabled: mainGroups.enabled !== false,
    items: mergedItems.slice(0, 3) as [MainGroupItem, MainGroupItem, MainGroupItem],
  };
}

function mergeHeroSideBanner(value: unknown, index: number): HeroSideBanner {
  const banner = isObject(value) ? value : {};

  return {
    id: typeof banner.id === "string" ? banner.id : `hero-side-${index + 1}`,
    image: typeof banner.image === "string" ? banner.image : "",
    linkUrl: typeof banner.linkUrl === "string" ? banner.linkUrl : "",
  };
}

function mergeHeroSlide(value: unknown, index: number): HeroSlide {
  const slide = isObject(value) ? value : {};

  return {
    id: typeof slide.id === "string" ? slide.id : `hero-slide-${index + 1}`,
    mediaType: slide.mediaType === "video" ? "video" : "image",
    desktopImage: typeof slide.desktopImage === "string" ? slide.desktopImage : "",
    tabletImage: typeof slide.tabletImage === "string" ? slide.tabletImage : "",
    mobileImage: typeof slide.mobileImage === "string" ? slide.mobileImage : "",
    desktopVideo: typeof slide.desktopVideo === "string" ? slide.desktopVideo : "",
    tabletVideo: typeof slide.tabletVideo === "string" ? slide.tabletVideo : "",
    mobileVideo: typeof slide.mobileVideo === "string" ? slide.mobileVideo : "",
    linkUrl: typeof slide.linkUrl === "string" ? slide.linkUrl : "",
  };
}

function mergeHeroSettings(value: unknown): ThemeSettings["hero"] {
  const hero = isObject(value) ? value : {};
  const merged = {
    ...defaultThemeSettings.hero,
    ...hero,
  };

  let slides = Array.isArray(hero.slides)
    ? hero.slides.filter(isObject).map((slide, index) => mergeHeroSlide(slide, index))
    : [];

  const hasLegacyImages = Boolean(merged.desktopImage || merged.tabletImage || merged.mobileImage);

  if (slides.length === 0 && hasLegacyImages) {
    slides = [
      {
        id: "hero-slide-1",
        mediaType: "image",
        desktopImage: merged.desktopImage,
        tabletImage: merged.tabletImage,
        mobileImage: merged.mobileImage,
        desktopVideo: "",
        tabletVideo: "",
        mobileVideo: "",
        linkUrl: "",
      },
    ];
  }

  if (slides.length === 0) {
    slides = [...defaultThemeSettings.hero.slides];
  }

  const firstSlide = slides[0];
  const defaultSideBanners = createDefaultHeroSideBanners();
  const mergedSideBanners = Array.isArray(hero.sideBanners)
    ? hero.sideBanners.filter(isObject).map((banner, index) => mergeHeroSideBanner(banner, index))
    : [];
  const sideBanners: [HeroSideBanner, HeroSideBanner] = [
    mergedSideBanners[0] || defaultSideBanners[0],
    mergedSideBanners[1] || defaultSideBanners[1],
  ];

  return {
    ...merged,
    desktopImage: firstSlide.desktopImage || merged.desktopImage,
    tabletImage: firstSlide.tabletImage || merged.tabletImage,
    mobileImage: firstSlide.mobileImage || merged.mobileImage,
    slides,
    carouselIntervalSeconds:
      typeof hero.carouselIntervalSeconds === "number"
        ? Math.min(30, Math.max(3, hero.carouselIntervalSeconds))
        : defaultThemeSettings.hero.carouselIntervalSeconds,
    layoutMode: hero.layoutMode === "split" ? "split" : "full",
    sideBanners,
  };
}

function mergeProductCardSettings(value: unknown): ThemeSettings["productCard"] {
  const productCard = isObject(value) ? value : {};

  return {
    ...defaultThemeSettings.productCard,
    ...productCard,
    borderWidth:
      typeof productCard.borderWidth === "number"
        ? Math.max(0, productCard.borderWidth)
        : defaultThemeSettings.productCard.borderWidth,
    borderRadius:
      typeof productCard.borderRadius === "number"
        ? Math.max(0, productCard.borderRadius)
        : defaultThemeSettings.productCard.borderRadius,
    codeMode: productCard.codeMode === "titleModel" ? "titleModel" : "titleSk",
  };
}

function mergeWidgetButtonStyle(value: unknown, defaultStyle: WidgetButtonStyle): WidgetButtonStyle {
  const style = isObject(value) ? value : {};

  return {
    ...defaultStyle,
    size:
      typeof style.size === "number"
        ? Math.min(80, Math.max(32, style.size))
        : defaultStyle.size,
    backgroundColor:
      typeof style.backgroundColor === "string" && style.backgroundColor.trim()
        ? style.backgroundColor
        : defaultStyle.backgroundColor,
    hoverBackgroundColor:
      typeof style.hoverBackgroundColor === "string" && style.hoverBackgroundColor.trim()
        ? style.hoverBackgroundColor
        : defaultStyle.hoverBackgroundColor,
    iconColor:
      typeof style.iconColor === "string" && style.iconColor.trim()
        ? style.iconColor
        : defaultStyle.iconColor,
    shape: style.shape === "square" ? "square" : "circle",
    borderRadius:
      typeof style.borderRadius === "number"
        ? Math.min(32, Math.max(0, style.borderRadius))
        : defaultStyle.borderRadius,
    borderEnabled: typeof style.borderEnabled === "boolean" ? style.borderEnabled : defaultStyle.borderEnabled,
    borderColor:
      typeof style.borderColor === "string" && style.borderColor.trim()
        ? style.borderColor
        : defaultStyle.borderColor,
    borderWidth:
      typeof style.borderWidth === "number"
        ? Math.min(6, Math.max(0, style.borderWidth))
        : defaultStyle.borderWidth,
  };
}

function mergeCategoriesSettings(value: unknown): CategoriesSectionSettings {
  if (typeof value === "boolean") {
    return {
      ...defaultThemeSettings.sections.categories,
      enabled: value,
    };
  }

  const categories = isObject(value) ? value : {};

  return {
    enabled:
      typeof categories.enabled === "boolean"
        ? categories.enabled
        : defaultThemeSettings.sections.categories.enabled,
    desktopVisibleCount:
      typeof categories.desktopVisibleCount === "number"
        ? Math.min(20, Math.max(1, categories.desktopVisibleCount))
        : defaultThemeSettings.sections.categories.desktopVisibleCount,
    tabletVisibleCount:
      typeof categories.tabletVisibleCount === "number"
        ? Math.min(12, Math.max(1, categories.tabletVisibleCount))
        : defaultThemeSettings.sections.categories.tabletVisibleCount,
    mobileVisibleCount:
      typeof categories.mobileVisibleCount === "number"
        ? Math.min(8, Math.max(1, categories.mobileVisibleCount))
        : defaultThemeSettings.sections.categories.mobileVisibleCount,
    carouselIntervalSeconds:
      typeof categories.carouselIntervalSeconds === "number"
        ? Math.min(30, Math.max(2, categories.carouselIntervalSeconds))
        : defaultThemeSettings.sections.categories.carouselIntervalSeconds,
  };
}

function mergeDesktopSidebarPlacement(value: unknown): DesktopSidebarPlacement {
  const placement = isObject(value) ? value : {};

  return {
    topPercent: clampPlacement(
      typeof placement.topPercent === "number"
        ? placement.topPercent
        : defaultThemeSettings.socialMedia.desktopSidebarPlacement.topPercent,
      0,
      100,
    ),
    inset: clampPlacement(
      typeof placement.inset === "number"
        ? placement.inset
        : defaultThemeSettings.socialMedia.desktopSidebarPlacement.inset,
      0,
      300,
    ),
  };
}

function mergeMobileLauncherPlacement(value: unknown): MobileLauncherPlacement {
  const placement = isObject(value) ? value : {};

  return {
    bottom: clampPlacement(
      typeof placement.bottom === "number"
        ? placement.bottom
        : defaultThemeSettings.socialMedia.mobileLauncherPlacement.bottom,
      0,
      300,
    ),
    inset: clampPlacement(
      typeof placement.inset === "number"
        ? placement.inset
        : defaultThemeSettings.socialMedia.mobileLauncherPlacement.inset,
      0,
      300,
    ),
  };
}

function mergeSocialMediaSettings(value: unknown): ThemeSettings["socialMedia"] {
  const socialMedia = isObject(value) ? value : {};

  return {
    ...defaultThemeSettings.socialMedia,
    ...socialMedia,
    enabled: typeof socialMedia.enabled === "boolean" ? socialMedia.enabled : defaultThemeSettings.socialMedia.enabled,
    facebookUrl: typeof socialMedia.facebookUrl === "string" ? socialMedia.facebookUrl : "",
    instagramUrl: typeof socialMedia.instagramUrl === "string" ? socialMedia.instagramUrl : "",
    tiktokUrl: typeof socialMedia.tiktokUrl === "string" ? socialMedia.tiktokUrl : "",
    buttonStyle: mergeWidgetButtonStyle(
      socialMedia.buttonStyle,
      defaultThemeSettings.socialMedia.buttonStyle,
    ),
    mobileLauncherStyle: mergeWidgetButtonStyle(
      socialMedia.mobileLauncherStyle,
      defaultThemeSettings.socialMedia.mobileLauncherStyle,
    ),
    desktopSidebarPlacement: mergeDesktopSidebarPlacement(socialMedia.desktopSidebarPlacement),
    mobileLauncherPlacement: mergeMobileLauncherPlacement(socialMedia.mobileLauncherPlacement),
  };
}

function mergeFloatingActionsSettings(value: unknown): ThemeSettings["floatingActions"] {
  const floatingActions = isObject(value) ? value : {};

  return {
    ...defaultThemeSettings.floatingActions,
    ...floatingActions,
    whatsappEnabled:
      typeof floatingActions.whatsappEnabled === "boolean"
        ? floatingActions.whatsappEnabled
        : defaultThemeSettings.floatingActions.whatsappEnabled,
    whatsappPhone:
      typeof floatingActions.whatsappPhone === "string" && floatingActions.whatsappPhone.trim()
        ? floatingActions.whatsappPhone.trim()
        : defaultThemeSettings.floatingActions.whatsappPhone,
    scrollTopEnabled:
      typeof floatingActions.scrollTopEnabled === "boolean"
        ? floatingActions.scrollTopEnabled
        : defaultThemeSettings.floatingActions.scrollTopEnabled,
    whatsappStyle: mergeWidgetButtonStyle(
      floatingActions.whatsappStyle,
      defaultThemeSettings.floatingActions.whatsappStyle,
    ),
    scrollTopStyle: mergeWidgetButtonStyle(
      floatingActions.scrollTopStyle,
      defaultThemeSettings.floatingActions.scrollTopStyle,
    ),
    whatsappPlacement: mergeResponsiveWidgetPlacement(
      floatingActions.whatsappPlacement,
      defaultThemeSettings.floatingActions.whatsappPlacement,
    ),
    scrollTopPlacement: mergeResponsiveWidgetPlacement(
      floatingActions.scrollTopPlacement,
      defaultThemeSettings.floatingActions.scrollTopPlacement,
    ),
  };
}

function mergeSettings(settings: unknown): ThemeSettings {
  if (!isObject(settings)) {
    return defaultThemeSettings;
  }

  const customSections = mergeCustomSections(settings.customSections);
  const homeSectionsOrder = mergeHomeSectionsOrder(settings.homeSectionsOrder, customSections);

  return {
    ...defaultThemeSettings,
    ...settings,
    brand: mergeBrandSettings(settings.brand),
    topBanner: mergeTopBannerSettings(settings.topBanner),
    header: { ...defaultThemeSettings.header, ...(isObject(settings.header) ? settings.header : {}) },
    navigation: Array.isArray(settings.navigation)
      ? settings.navigation.filter((item): item is MenuItem => isObject(item) && typeof item.label === "string" && typeof item.href === "string")
      : defaultThemeSettings.navigation,
    hero: mergeHeroSettings(settings.hero),
    sections: {
      ...defaultThemeSettings.sections,
      ...(isObject(settings.sections) ? settings.sections : {}),
      mainGroups: mergeMainGroupsSettings(
        isObject(settings.sections) ? settings.sections.mainGroups : undefined,
      ),
      customBanner: mergeCustomBannerSettings(
        isObject(settings.sections) ? settings.sections.customBanner : undefined,
      ),
      categories: mergeCategoriesSettings(
        isObject(settings.sections) ? settings.sections.categories : undefined,
      ),
    },
    footer: { ...defaultThemeSettings.footer, ...(isObject(settings.footer) ? settings.footer : {}) },
    socialMedia: mergeSocialMediaSettings(settings.socialMedia),
    floatingActions: mergeFloatingActionsSettings(settings.floatingActions),
    productCard: mergeProductCardSettings(settings.productCard),
    homeSectionsOrder,
    homeSectionStyles: mergeHomeSectionStyles(settings.homeSectionStyles, homeSectionsOrder),
    homeSectionGroups: mergeHomeSectionGroups(settings.homeSectionGroups, homeSectionsOrder),
    customSections,
    visualEditor: {
      ...defaultThemeSettings.visualEditor,
      ...(isObject(settings.visualEditor) ? settings.visualEditor : {}),
    },
    visualTextStyles: isObject(settings.visualTextStyles)
      ? Object.fromEntries(
          Object.entries(settings.visualTextStyles).filter(([, value]) => isObject(value)),
        ) as Record<string, VisualTextStyle>
      : defaultThemeSettings.visualTextStyles,
    visualTextContent: isObject(settings.visualTextContent)
      ? Object.fromEntries(
          Object.entries(settings.visualTextContent).filter(([, value]) => typeof value === "string"),
        ) as Record<string, string>
      : defaultThemeSettings.visualTextContent,
  };
}

function parseStoredSettings(settings: unknown) {
  if (typeof settings !== "string") {
    return settings;
  }

  try {
    return JSON.parse(settings) as unknown;
  } catch {
    return null;
  }
}

async function ensureThemeSettingsTable(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ThemeSettings\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`settings\` LONGTEXT NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`ThemeSettings\`
    MODIFY \`settings\` LONGTEXT NOT NULL;
  `);
}

export async function getThemeSettings(): Promise<ThemeSettings> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return defaultThemeSettings;
  }

  try {
    await ensureThemeSettingsTable(prisma);

    const rows = await prisma.$queryRaw<Array<{ settings: unknown }>>`
      SELECT settings
      FROM ThemeSettings
      WHERE id = 'site'
      LIMIT 1
    `;

    return mergeSettings(parseStoredSettings(rows[0]?.settings));
  } catch {
    return defaultThemeSettings;
  }
}

export async function updateThemeSettings(settings: ThemeSettings): Promise<ThemeSettings> {
  const mergedSettings = mergeSettings(settings);
  const prisma = getPrismaClient();

  if (!prisma) {
    return mergedSettings;
  }

  await ensureThemeSettingsTable(prisma);
  await prisma.$executeRaw`
    INSERT INTO ThemeSettings (id, settings)
    VALUES ('site', ${JSON.stringify(mergedSettings)})
    ON DUPLICATE KEY UPDATE
      settings = VALUES(settings),
      updatedAt = CURRENT_TIMESTAMP(3)
  `;

  return mergedSettings;
}

export function getThemeCssVariables(settings: ThemeSettings) {
  return {
    "--brand-gold": settings.brand.primaryColor,
    "--brand-gold-dark": settings.brand.primaryColorDark,
    "--background": settings.brand.backgroundColor,
    "--product-card-border-width": `${settings.productCard.borderWidth}px`,
    "--product-card-border-radius": `${settings.productCard.borderRadius}px`,
  } as CSSProperties;
}

