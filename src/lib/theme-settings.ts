import "server-only";

import type { CSSProperties } from "react";

import { getPrismaClient } from "./db";

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

export type HomeSectionId = "hero" | "trustBadges" | "categories" | "bestSellers" | "customBanner" | "competitiveBanner";
export type HomeSectionOrderItem = HomeSectionId | `custom:${string}`;

export type HomeSectionStyle = {
  spacingTop: number;
  spacingBottom: number;
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
  };
  fontSizeDesktop: number;
  fontSizeTablet: number;
  fontSizeMobile: number;
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
  };
  sections: {
    trustBadges: boolean;
    categories: boolean;
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
    };
  };
  footer: {
    description: string;
    copyright: string;
  };
  productCard: {
    borderWidth: number;
    borderRadius: number;
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
  },
  sections: {
    trustBadges: true,
    categories: true,
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
    },
  },
  footer: {
    description:
      "تجربة شراء مباشرة لمنتجات سوكاني الأصلية بضمان لمدة عام ضد عيوب الصناعة وخدمة شحن داخل محافظات الجمهورية.",
    copyright: "SOKANY Egypt. جميع الحقوق محفوظة.",
  },
  productCard: {
    borderWidth: 1,
    borderRadius: 0,
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
    spacingTop: typeof style.spacingTop === "number" ? Math.max(0, style.spacingTop) : 64,
    spacingBottom: typeof style.spacingBottom === "number" ? Math.max(0, style.spacingBottom) : 64,
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
    hero: { ...defaultThemeSettings.hero, ...(isObject(settings.hero) ? settings.hero : {}) },
    sections: {
      ...defaultThemeSettings.sections,
      ...(isObject(settings.sections) ? settings.sections : {}),
      customBanner: {
        ...defaultThemeSettings.sections.customBanner,
        ...(isObject(settings.sections) && isObject(settings.sections.customBanner)
          ? settings.sections.customBanner
          : {}),
      },
    },
    footer: { ...defaultThemeSettings.footer, ...(isObject(settings.footer) ? settings.footer : {}) },
    productCard: {
      ...defaultThemeSettings.productCard,
      ...(isObject(settings.productCard) ? settings.productCard : {}),
      borderWidth:
        isObject(settings.productCard) && typeof settings.productCard.borderWidth === "number"
          ? Math.max(0, settings.productCard.borderWidth)
          : defaultThemeSettings.productCard.borderWidth,
      borderRadius:
        isObject(settings.productCard) && typeof settings.productCard.borderRadius === "number"
          ? Math.max(0, settings.productCard.borderRadius)
          : defaultThemeSettings.productCard.borderRadius,
    },
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

