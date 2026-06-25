import "server-only";

import type { CSSProperties } from "react";

import { getPrismaClient } from "./db";

export type MenuItem = {
  label: string;
  href: string;
};

export type VisualTextStyle = {
  x: number;
  y: number;
  fontSizeDelta: number;
};

export type HomeSectionId = "hero" | "trustBadges" | "categories" | "bestSellers" | "customBanner" | "competitiveBanner";

export type CustomHomeSectionDisplayMode = "grid" | "carousel";
export type CustomHomeSectionType = "bannerWithProducts";

export type CustomHomeSection = {
  id: string;
  enabled: boolean;
  sectionType: CustomHomeSectionType;
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
  fontSizeDesktop: number;
  fontSizeTablet: number;
  fontSizeMobile: number;
};

export type ThemeSettings = {
  brand: {
    logoUrl: string;
    logoText: string;
    tagline: string;
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
    contentAlign: "right" | "center" | "left";
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
  homeSectionsOrder: HomeSectionId[];
  customSections: CustomHomeSection[];
  visualEditor: {
    enabled: boolean;
  };
  visualTextStyles: Record<string, VisualTextStyle>;
  visualTextContent: Record<string, string>;
};

export const defaultHomeSectionsOrder: HomeSectionId[] = [
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
    primaryColor: "#DAFF00",
    primaryColorDark: "#C1E200",
    backgroundColor: "#F4F5F2",
    fontFamily: "Almarai",
  },
  topBanner: {
    enabled: true,
    text: "شحن داخل محافظات مصر • ضمان عام • منتجات أصلية من الوكيل الحصري",
    url: "/shop",
    desktopImage: "",
    mobileImage: "",
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
    contentAlign: "right",
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
  homeSectionsOrder: defaultHomeSectionsOrder,
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

function mergeHomeSectionsOrder(value: unknown) {
  if (!Array.isArray(value)) {
    return defaultThemeSettings.homeSectionsOrder;
  }

  const allowedSections = new Set<HomeSectionId>(defaultHomeSectionsOrder);
  const selectedSections = value.filter((section): section is HomeSectionId => allowedSections.has(section));
  const missingSections = defaultHomeSectionsOrder.filter((section) => !selectedSections.includes(section));

  return [...selectedSections, ...missingSections];
}

function mergeCustomSections(value: unknown): CustomHomeSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isObject).map((section, index) => ({
    id: typeof section.id === "string" ? section.id : `custom-section-${index + 1}`,
    enabled: typeof section.enabled === "boolean" ? section.enabled : true,
    sectionType: section.sectionType === "bannerWithProducts" ? "bannerWithProducts" : "bannerWithProducts",
    title: typeof section.title === "string" ? section.title : "سكشن مخصص",
    subtitle: typeof section.subtitle === "string" ? section.subtitle : "",
    text: typeof section.text === "string" ? section.text : "",
    backgroundColor: typeof section.backgroundColor === "string" ? section.backgroundColor : "#101010",
    textColor: typeof section.textColor === "string" ? section.textColor : "#ffffff",
    linkUrl: typeof section.linkUrl === "string" ? section.linkUrl : "/shop",
    desktopImage: typeof section.desktopImage === "string" ? section.desktopImage : "",
    tabletImage: typeof section.tabletImage === "string" ? section.tabletImage : "",
    mobileImage: typeof section.mobileImage === "string" ? section.mobileImage : "",
    categorySlug: typeof section.categorySlug === "string" ? section.categorySlug : "",
    productLimit: typeof section.productLimit === "number" ? section.productLimit : 4,
    desktopColumns: typeof section.desktopColumns === "number" ? section.desktopColumns : 4,
    tabletColumns: typeof section.tabletColumns === "number" ? section.tabletColumns : 2,
    mobileColumns: typeof section.mobileColumns === "number" ? section.mobileColumns : 1,
    rowCount: typeof section.rowCount === "number" ? section.rowCount : 1,
    displayMode: section.displayMode === "carousel" ? "carousel" : "grid",
    fontSizeDesktop: typeof section.fontSizeDesktop === "number" ? section.fontSizeDesktop : 56,
    fontSizeTablet: typeof section.fontSizeTablet === "number" ? section.fontSizeTablet : 42,
    fontSizeMobile: typeof section.fontSizeMobile === "number" ? section.fontSizeMobile : 32,
  }));
}

function mergeSettings(settings: unknown): ThemeSettings {
  if (!isObject(settings)) {
    return defaultThemeSettings;
  }

  return {
    ...defaultThemeSettings,
    ...settings,
    brand: { ...defaultThemeSettings.brand, ...(isObject(settings.brand) ? settings.brand : {}) },
    topBanner: {
      ...defaultThemeSettings.topBanner,
      ...(isObject(settings.topBanner) ? settings.topBanner : {}),
    },
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
    homeSectionsOrder: mergeHomeSectionsOrder(settings.homeSectionsOrder),
    customSections: mergeCustomSections(settings.customSections),
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
  } as CSSProperties;
}

