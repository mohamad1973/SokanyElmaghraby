"use client";

import { FormEvent, useId, useMemo, useRef, useState } from "react";

import type {
  CustomHomeSection,
  HeroMediaType,
  HeroSlide,
  HomeSectionGroupStyle,
  HomeSectionId,
  HomeSectionOrderItem,
  HomeSectionStyle,
  MenuItem,
  ThemeSettings,
} from "@/lib/theme-settings";
import { heroSlideHasMedia } from "@/lib/hero-slide-utils";
import { defaultBannerSpacing, defaultSideBannerSpacing, type BannerSpacing } from "@/lib/banner-spacing";

import { ImageUploadField } from "./image-upload-field";
import { MediaUploadField } from "./media-upload-field";

type SettingsFormProps = {
  settings: ThemeSettings;
  focus: "theme" | "header" | "footer" | "banners" | "navigation" | "socialMedia";
};

const sectionLabels: Record<HomeSectionId, string> = {
  hero: "بنر الواجهة الرئيسي",
  trustBadges: "مربعات المزايا",
  categories: "تسوق حسب التصنيف",
  bestSellers: "الأكثر مبيعاً",
  customBanner: "بنر العروض العام",
  competitiveBanner: "سكشن الميزة التنافسية",
};

function getCustomSectionOrderId(sectionId: string): HomeSectionOrderItem {
  return `custom:${sectionId}`;
}

function getHomeSectionLabel(sectionId: HomeSectionOrderItem, customSections: CustomHomeSection[]) {
  if (sectionId.startsWith("custom:")) {
    const customSectionId = sectionId.replace("custom:", "");
    const customSection = customSections.find((section) => section.id === customSectionId);
    const customSectionIndex = customSections.findIndex((section) => section.id === customSectionId);

    if (!customSection) {
      return "سكشن مخصص غير موجود";
    }

    const title = customSection.title.trim() || `سكشن مخصص رقم ${customSectionIndex + 1}`;
    const categoryLabel = customSection.categorySlug ? ` - ${customSection.categorySlug}` : "";

    return `${title}${categoryLabel}`;
  }

  return sectionLabels[sectionId as HomeSectionId];
}

function createHomeSectionStyle(): HomeSectionStyle {
  return {
    spacingTop: 64,
    spacingBottom: 64,
    paddingLeft: 0,
    paddingRight: 0,
    widthMode: "contained",
    borderEnabled: false,
    borderColor: "#111111",
    borderWidth: 1,
    borderRadius: 24,
    groupId: "",
  };
}

function createHomeSectionGroup(): HomeSectionGroupStyle {
  return {
    id: `group-${Date.now()}`,
    label: "مجموعة جديدة",
    sectionIds: [],
    borderEnabled: true,
    borderColor: "#111111",
    borderWidth: 1,
    borderRadius: 24,
    spacingTop: 64,
    spacingBottom: 64,
  };
}

function getSectionStyle(settings: ThemeSettings, sectionId: HomeSectionOrderItem) {
  return settings.homeSectionStyles[sectionId] || createHomeSectionStyle();
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-zinc-700">
      {label}
      {children}
    </label>
  );
}

function BannerSpacingFields({
  label,
  spacing,
  onChange,
  showGapToContent = false,
}: {
  label?: string;
  spacing: BannerSpacing;
  onChange: (spacing: BannerSpacing) => void;
  showGapToContent?: boolean;
}) {
  const fields: Array<{ key: keyof BannerSpacing; label: string }> = [
    { key: "spacingTop", label: "مسافة فوق البنر (px)" },
    { key: "spacingBottom", label: "مسافة تحت البنر (px)" },
    { key: "paddingLeft", label: "بادنج يسار (px)" },
    { key: "paddingRight", label: "بادنج يمين (px)" },
  ];

  if (showGapToContent) {
    fields.push({ key: "gapToContent", label: "المسافة بين البنر والمحتوى التالي (px)" });
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-black/10 bg-zinc-50 p-4">
      {label ? (
        <div>
          <h3 className="text-base font-bold text-zinc-950">{label}</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            تحكم في صعود وهبوط البنر وأبعاده يميناً ويساراً عن حافة الصفحة.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <Field key={field.key} label={field.label}>
            <input
              type="number"
              min={0}
              max={field.key === "gapToContent" ? 120 : 200}
              value={spacing[field.key]}
              onChange={(event) =>
                onChange({
                  ...spacing,
                  [field.key]: Number(event.target.value),
                })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

function createHeroSlide(): HeroSlide {
  return {
    id: `hero-slide-${Date.now()}`,
    mediaType: "image",
    desktopImage: "",
    tabletImage: "",
    mobileImage: "",
    desktopVideo: "",
    tabletVideo: "",
    mobileVideo: "",
    linkUrl: "",
  };
}

function syncHeroWithSlides(hero: ThemeSettings["hero"], slides: HeroSlide[]): ThemeSettings["hero"] {
  const firstSlide = slides[0];

  return {
    ...hero,
    slides,
    enabled: hero.enabled || slides.some(heroSlideHasMedia),
    desktopImage: firstSlide?.desktopImage || "",
    tabletImage: firstSlide?.tabletImage || "",
    mobileImage: firstSlide?.mobileImage || "",
  };
}

function getHeroCarouselRecommendations(_layoutMode: ThemeSettings["hero"]["layoutMode"]) {
  return {
    desktop: "1920x800px",
    tablet: "1920x800px",
    mobile: "1920x800px",
    desktopRatio: "12:5",
    tabletRatio: "12:5",
    mobileRatio: "12:5",
  };
}

function MultilineTextField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function addNewLine() {
    const textarea = textareaRef.current;

    if (!textarea) {
      onChange(`${value}\n`);
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}\n${value.slice(end)}`;

    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 1, start + 1);
    });
  }

  return (
    <div className="grid gap-2 text-sm font-bold text-zinc-700">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className || "min-h-20 rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"}
      />
      <button
        type="button"
        onClick={addNewLine}
        className="w-fit rounded-full border border-black/10 bg-zinc-50 px-4 py-2 text-xs font-bold text-zinc-700 transition hover:bg-brand-gold hover:text-black"
      >
        + إضافة سطر جديد
      </button>
    </div>
  );
}

function textToNavigation(value: string): MenuItem[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, href] = line.split("|").map((part) => part.trim());
      return { label, href: href || "/" };
    })
    .filter((item) => item.label);
}

function navigationToText(items: MenuItem[]) {
  return items.map((item) => `${item.label} | ${item.href}`).join("\n");
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];

  return nextItems;
}

function extractCategorySlug(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  try {
    const url = new URL(trimmedValue);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.at(-1) || trimmedValue;
  } catch {
    const parts = trimmedValue.split("/").filter(Boolean);
    return parts.at(-1) || trimmedValue;
  }
}

function createCustomSection(): CustomHomeSection {
  return {
    id: `custom-${Date.now()}`,
    enabled: true,
    sectionType: "bannerWithProducts",
    showMainBanner: false,
    mainBannerSpacing: defaultBannerSpacing,
    title: "سكشن منتجات جديد",
    subtitle: "",
    text: "",
    backgroundColor: "#101010",
    textColor: "#ffffff",
    linkUrl: "/shop",
    desktopImage: "",
    tabletImage: "",
    mobileImage: "",
    categorySlug: "",
    productLimit: 4,
    desktopColumns: 4,
    tabletColumns: 2,
    mobileColumns: 2,
    rowCount: 1,
    displayMode: "grid",
    sideBanner: {
      enabled: false,
      image: "",
      linkUrl: "",
      position: "right",
      showOnMobile: false,
      spacing: defaultSideBannerSpacing,
    },
    fontSizeDesktop: 56,
    fontSizeTablet: 42,
    fontSizeMobile: 32,
  };
}

export function SettingsForm({ settings: initialSettings, focus }: SettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [navigationText, setNavigationText] = useState(navigationToText(initialSettings.navigation));
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const title = useMemo(() => {
    const titles = {
      theme: "الألوان والفونتات واللوجو",
      header: "الهيدر والموبايل",
      footer: "الفوتر",
      banners: "البنرات والسكشنات",
      navigation: "المنيو",
      socialMedia: "السوشيال ميديا والأزرار العائمة",
    };

    return titles[focus];
  }, [focus]);

  async function saveSettings(nextSettings: ThemeSettings, successMessage: string) {
    setIsSaving(true);
    setStatus("");

    const payload = {
      ...nextSettings,
      navigation: textToNavigation(navigationText),
    };

    const response = await fetch("/api/admin/theme-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    setIsSaving(false);

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
      setStatus(errorPayload?.message || "تعذر حفظ الإعدادات. حاول مرة أخرى أو راجع اتصال لوحة التحكم.");
      return;
    }

    const savedSettings = (await response.json()) as ThemeSettings;
    setSettings(savedSettings);
    setNavigationText(navigationToText(savedSettings.navigation));
    setStatus(successMessage);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveSettings(settings, "تم حفظ الإعدادات بنجاح. افتح الفرونت أو اعمل Refresh لرؤية التغييرات.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-950">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          يعمل الموقع الآن بدون WordPress plugin، وتعتمد المنيو على تصنيفات WooCommerce مباشرة.
        </p>
      </div>

      {focus === "theme" ? (
        <section className="grid gap-5 rounded-xl border border-black/10 bg-white p-6 shadow-sm lg:grid-cols-2">
          <div className="lg:col-span-2">
            <ImageUploadField
              label="صورة اللوجو"
              value={settings.brand.logoUrl}
              purpose="logo"
              recommendation="Desktop: 240x80px أو SVG، Mobile: 160x54px"
              aspectRatio="3:1"
              onUploaded={(url) =>
                setSettings({ ...settings, brand: { ...settings.brand, logoUrl: url } })
              }
            />
          </div>
          <div className="rounded-xl bg-brand-cream p-4 text-sm font-bold leading-7 text-zinc-800 lg:col-span-2">
            مقاسات مقترحة عامة: ديسكتوب 1920x800 (responsive)، تابلت 1200x600، موبايل 750x900.
            مقاسات العنوان المقترحة: ديسكتوب 48-64px، تابلت 36-48px، موبايل 28-36px.
          </div>
          <div className="grid gap-4 rounded-2xl border border-black/10 bg-zinc-50 p-4 lg:col-span-2 lg:grid-cols-4">
            {[
              ["عرض اللوجو موبايل px", "logoMobileWidth"],
              ["ارتفاع اللوجو موبايل px", "logoMobileHeight"],
              ["عرض اللوجو ديسكتوب px", "logoDesktopWidth"],
              ["ارتفاع اللوجو ديسكتوب px", "logoDesktopHeight"],
            ].map(([label, key]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  min={1}
                  value={settings.brand[key as "logoMobileWidth" | "logoMobileHeight" | "logoDesktopWidth" | "logoDesktopHeight"]}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      brand: {
                        ...settings.brand,
                        [key]: Number(event.target.value),
                      },
                    })
                  }
                  className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                />
              </Field>
            ))}
          </div>
          <Field label="نص اللوجو">
            <input
              value={settings.brand.logoText}
              onChange={(event) =>
                setSettings({ ...settings, brand: { ...settings.brand, logoText: event.target.value } })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <Field label="النص أسفل اللوجو">
            <input
              value={settings.brand.tagline}
              onChange={(event) =>
                setSettings({ ...settings, brand: { ...settings.brand, tagline: event.target.value } })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <Field label="اللون الأساسي">
            <input
              type="color"
              value={settings.brand.primaryColor}
              onChange={(event) =>
                setSettings({ ...settings, brand: { ...settings.brand, primaryColor: event.target.value } })
              }
              className="h-12 rounded-xl border border-black/10 px-2"
            />
          </Field>
          <Field label="اللون الأساسي الداكن">
            <input
              type="color"
              value={settings.brand.primaryColorDark}
              onChange={(event) =>
                setSettings({ ...settings, brand: { ...settings.brand, primaryColorDark: event.target.value } })
              }
              className="h-12 rounded-xl border border-black/10 px-2"
            />
          </Field>
          <Field label="لون الخلفية">
            <input
              type="color"
              value={settings.brand.backgroundColor}
              onChange={(event) =>
                setSettings({ ...settings, brand: { ...settings.brand, backgroundColor: event.target.value } })
              }
              className="h-12 rounded-xl border border-black/10 px-2"
            />
          </Field>
          <Field label="الفونت">
            <input
              value={settings.brand.fontFamily}
              onChange={(event) =>
                setSettings({ ...settings, brand: { ...settings.brand, fontFamily: event.target.value } })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <Field label="سمك بوردر كارت المنتج px">
            <input
              type="number"
              min={0}
              value={settings.productCard.borderWidth}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  productCard: { ...settings.productCard, borderWidth: Number(event.target.value) },
                })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <Field label="Radius كارت المنتج px">
            <input
              type="number"
              min={0}
              value={settings.productCard.borderRadius}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  productCard: { ...settings.productCard, borderRadius: Number(event.target.value) },
                })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <Field label="طريقة عرض رمز المنتج">
            <select
              value={settings.productCard.codeMode}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  productCard: {
                    ...settings.productCard,
                    codeMode: event.target.value === "titleModel" ? "titleModel" : "titleSk",
                  },
                })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            >
              <option value="titleSk">كود SK من العنوان</option>
              <option value="titleModel">الموديل من العنوان (بعد كلمة موديل)</option>
            </select>
          </Field>
          <p className="-mt-2 text-xs font-semibold text-zinc-500 lg:col-span-2">
            يظهر الرمز في كارت المنتج وصفحة المنتج والبحث. إن لم يُعثر على قيمة في العنوان يُستخدم SKU من WooCommerce.
          </p>
          <div className="rounded-xl bg-zinc-50 p-4 lg:col-span-2">
            <label className="flex items-center gap-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={settings.visualEditor.enabled}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    visualEditor: { ...settings.visualEditor, enabled: event.target.checked },
                  })
                }
              />
              تفعيل تعديل النص في الفرونت اند للأدمن فقط
            </label>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              بعد التفعيل افتح الموقع كأدمن، حدد أي نص ثابت مثل العناوين والأوصاف والأزرار، عدله مباشرة ثم اضغط زر حفظ أعلى الصفحة.
              أسماء المنتجات والتصنيفات والأسعار يتم تعديلها من WooCommerce لأنها بيانات متجر وليست نصوص واجهة ثابتة.
            </p>
          </div>
          <div className="grid gap-3 rounded-xl border border-black/10 bg-white p-4 lg:col-span-2">
            <div>
              <h2 className="text-lg font-bold text-zinc-950">ترتيب سكشنات الصفحة الرئيسية</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                استخدم أزرار رفع ونزول لإعادة ترتيب ظهور السكشنات في الفرونت اند.
              </p>
            </div>
            <div className="grid gap-2">
              {settings.homeSectionsOrder.map((sectionId, index) => {
                const sectionStyle = getSectionStyle(settings, sectionId);

                return (
                  <div key={sectionId} className="grid gap-4 rounded-xl bg-zinc-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-bold text-zinc-800">{getHomeSectionLabel(sectionId, settings.customSections)}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() =>
                            setSettings({
                              ...settings,
                              homeSectionsOrder: moveItem(settings.homeSectionsOrder, index, -1),
                            })
                          }
                          className="rounded-full border border-black/10 px-3 py-2 text-xs font-bold disabled:opacity-40"
                        >
                          رفع
                        </button>
                        <button
                          type="button"
                          disabled={index === settings.homeSectionsOrder.length - 1}
                          onClick={() =>
                            setSettings({
                              ...settings,
                              homeSectionsOrder: moveItem(settings.homeSectionsOrder, index, 1),
                            })
                          }
                          className="rounded-full border border-black/10 px-3 py-2 text-xs font-bold disabled:opacity-40"
                        >
                          نزول
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-xl border border-black/10 bg-white p-3 lg:grid-cols-4">
                      <Field label="عرض السكشن">
                        <select
                          value={sectionStyle.widthMode}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              homeSectionStyles: {
                                ...settings.homeSectionStyles,
                                [sectionId]: { ...sectionStyle, widthMode: event.target.value as "contained" | "full" },
                              },
                            })
                          }
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        >
                          <option value="contained">عرض عادي داخل الصفحة</option>
                          <option value="full">عرض كامل بعرض الشاشة</option>
                        </select>
                      </Field>
                      <Field label="المسافة فوق السكشن px">
                        <input
                          type="number"
                          min={0}
                          value={sectionStyle.spacingTop}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              homeSectionStyles: {
                                ...settings.homeSectionStyles,
                                [sectionId]: { ...sectionStyle, spacingTop: Number(event.target.value) },
                              },
                            })
                          }
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        />
                      </Field>
                      <Field label="المسافة تحت السكشن px">
                        <input
                          type="number"
                          min={0}
                          value={sectionStyle.spacingBottom}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              homeSectionStyles: {
                                ...settings.homeSectionStyles,
                                [sectionId]: { ...sectionStyle, spacingBottom: Number(event.target.value) },
                              },
                            })
                          }
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        />
                      </Field>
                      <Field label="بادنج يسار px">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={sectionStyle.paddingLeft}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              homeSectionStyles: {
                                ...settings.homeSectionStyles,
                                [sectionId]: { ...sectionStyle, paddingLeft: Number(event.target.value) },
                              },
                            })
                          }
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        />
                      </Field>
                      <Field label="بادنج يمين px">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={sectionStyle.paddingRight}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              homeSectionStyles: {
                                ...settings.homeSectionStyles,
                                [sectionId]: { ...sectionStyle, paddingRight: Number(event.target.value) },
                              },
                            })
                          }
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        />
                      </Field>
                      <Field label="لون البوردر">
                        <input
                          type="color"
                          value={sectionStyle.borderColor}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              homeSectionStyles: {
                                ...settings.homeSectionStyles,
                                [sectionId]: { ...sectionStyle, borderColor: event.target.value },
                              },
                            })
                          }
                          className="h-12 rounded-xl border border-black/10 px-2"
                        />
                      </Field>
                      <label className="flex items-center gap-3 text-sm font-bold text-zinc-800">
                        <input
                          type="checkbox"
                          checked={sectionStyle.borderEnabled}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              homeSectionStyles: {
                                ...settings.homeSectionStyles,
                                [sectionId]: { ...sectionStyle, borderEnabled: event.target.checked },
                              },
                            })
                          }
                        />
                        تفعيل بوردر حول السكشن
                      </label>
                      <Field label="سمك البوردر px">
                        <input
                          type="number"
                          min={0}
                          value={sectionStyle.borderWidth}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              homeSectionStyles: {
                                ...settings.homeSectionStyles,
                                [sectionId]: { ...sectionStyle, borderWidth: Number(event.target.value) },
                              },
                            })
                          }
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        />
                      </Field>
                      <Field label="Radius البوردر px">
                        <input
                          type="number"
                          min={0}
                          value={sectionStyle.borderRadius}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              homeSectionStyles: {
                                ...settings.homeSectionStyles,
                                [sectionId]: { ...sectionStyle, borderRadius: Number(event.target.value) },
                              },
                            })
                          }
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 rounded-xl border border-black/10 bg-white p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">مجموعات البوردر للسكشنات</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  استخدمها لعمل بوردر واحد حول سكشنين أو أكثر. الأفضل اختيار سكشنات متجاورة في ترتيب الصفحة.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSettings({
                    ...settings,
                    homeSectionGroups: [...settings.homeSectionGroups, createHomeSectionGroup()],
                  })
                }
                className="rounded-full bg-brand-gold px-4 py-2 text-sm font-bold text-black"
              >
                إضافة مجموعة بوردر
              </button>
            </div>

            <div className="grid gap-4">
              {settings.homeSectionGroups.map((group) => (
                <article key={group.id} className="grid gap-4 rounded-2xl bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-bold text-zinc-950">{group.label}</h3>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          homeSectionGroups: settings.homeSectionGroups.filter((item) => item.id !== group.id),
                        })
                      }
                      className="rounded-full border border-red-200 px-3 py-2 text-xs font-bold text-red-700"
                    >
                      حذف المجموعة
                    </button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-4">
                    <Field label="اسم المجموعة">
                      <input
                        value={group.label}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            homeSectionGroups: settings.homeSectionGroups.map((item) =>
                              item.id === group.id ? { ...item, label: event.target.value } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                    <Field label="لون البوردر">
                      <input
                        type="color"
                        value={group.borderColor}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            homeSectionGroups: settings.homeSectionGroups.map((item) =>
                              item.id === group.id ? { ...item, borderColor: event.target.value } : item,
                            ),
                          })
                        }
                        className="h-12 rounded-xl border border-black/10 px-2"
                      />
                    </Field>
                    <Field label="سمك البوردر px">
                      <input
                        type="number"
                        min={0}
                        value={group.borderWidth}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            homeSectionGroups: settings.homeSectionGroups.map((item) =>
                              item.id === group.id ? { ...item, borderWidth: Number(event.target.value) } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                    <Field label="Radius البوردر px">
                      <input
                        type="number"
                        min={0}
                        value={group.borderRadius}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            homeSectionGroups: settings.homeSectionGroups.map((item) =>
                              item.id === group.id ? { ...item, borderRadius: Number(event.target.value) } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                    <Field label="المسافة فوق المجموعة px">
                      <input
                        type="number"
                        min={0}
                        value={group.spacingTop}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            homeSectionGroups: settings.homeSectionGroups.map((item) =>
                              item.id === group.id ? { ...item, spacingTop: Number(event.target.value) } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                    <Field label="المسافة تحت المجموعة px">
                      <input
                        type="number"
                        min={0}
                        value={group.spacingBottom}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            homeSectionGroups: settings.homeSectionGroups.map((item) =>
                              item.id === group.id ? { ...item, spacingBottom: Number(event.target.value) } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                    <label className="flex items-center gap-3 text-sm font-bold text-zinc-800">
                      <input
                        type="checkbox"
                        checked={group.borderEnabled}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            homeSectionGroups: settings.homeSectionGroups.map((item) =>
                              item.id === group.id ? { ...item, borderEnabled: event.target.checked } : item,
                            ),
                          })
                        }
                      />
                      تفعيل بوردر المجموعة
                    </label>
                  </div>

                  <div className="grid gap-2 rounded-xl border border-black/10 bg-white p-3">
                    <p className="text-sm font-bold text-zinc-800">السكشنات داخل المجموعة</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {settings.homeSectionsOrder.map((sectionId) => (
                        <label key={sectionId} className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3 text-sm font-bold text-zinc-700">
                          <input
                            type="checkbox"
                            checked={group.sectionIds.includes(sectionId)}
                            onChange={(event) =>
                              setSettings({
                                ...settings,
                                homeSectionGroups: settings.homeSectionGroups.map((item) =>
                                  item.id === group.id
                                    ? {
                                        ...item,
                                        sectionIds: event.target.checked
                                          ? [...item.sectionIds, sectionId]
                                          : item.sectionIds.filter((selectedSectionId) => selectedSectionId !== sectionId),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                          {getHomeSectionLabel(sectionId, settings.customSections)}
                        </label>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="grid gap-4 rounded-xl border border-black/10 bg-white p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">السكشنات المخصصة</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  يمكنك إنشاء سكشن منتجات من تصنيف واحد مع بنر جانبي اختياري بحجم كارت المنتج، ثم اختر عدد المنتجات في الصف وطريقة العرض.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newSection = createCustomSection();
                  const newSectionOrderId = getCustomSectionOrderId(newSection.id);

                  setSettings({
                    ...settings,
                    customSections: [...settings.customSections, newSection],
                    homeSectionsOrder: [...settings.homeSectionsOrder, newSectionOrderId],
                    homeSectionStyles: {
                      ...settings.homeSectionStyles,
                      [newSectionOrderId]: createHomeSectionStyle(),
                    },
                  });
                }}
                className="rounded-full bg-brand-gold px-4 py-2 text-sm font-bold text-black"
              >
                إضافة سكشن جديد
              </button>
            </div>

            <div className="grid gap-4">
              {settings.customSections.map((section, index) => (
                <article key={section.id} className="grid gap-4 rounded-2xl bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-bold text-zinc-950">{section.title || `سكشن رقم ${index + 1}`}</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id ? { ...item, enabled: !item.enabled } : item,
                            ),
                          })
                        }
                        className="rounded-full border border-black/10 px-3 py-2 text-xs font-bold"
                      >
                        {section.enabled ? "إخفاء" : "إظهار"}
                      </button>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() =>
                          setSettings({
                            ...settings,
                            customSections: moveItem(settings.customSections, index, -1),
                          })
                        }
                        className="rounded-full border border-black/10 px-3 py-2 text-xs font-bold disabled:opacity-40"
                      >
                        رفع
                      </button>
                      <button
                        type="button"
                        disabled={index === settings.customSections.length - 1}
                        onClick={() =>
                          setSettings({
                            ...settings,
                            customSections: moveItem(settings.customSections, index, 1),
                          })
                        }
                        className="rounded-full border border-black/10 px-3 py-2 text-xs font-bold disabled:opacity-40"
                      >
                        نزول
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => saveSettings(settings, `تم حفظ سكشن ${section.title || index + 1}.`)}
                        className="rounded-full bg-brand-gold px-3 py-2 text-xs font-bold text-black disabled:opacity-60"
                      >
                        حفظ السكشن
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSettings(() => {
                            const deletedSectionOrderId = getCustomSectionOrderId(section.id);
                            const { [deletedSectionOrderId]: _deletedStyle, ...nextHomeSectionStyles } = settings.homeSectionStyles;
                            void _deletedStyle;

                            return {
                              ...settings,
                              customSections: settings.customSections.filter((item) => item.id !== section.id),
                              homeSectionsOrder: settings.homeSectionsOrder.filter((item) => item !== deletedSectionOrderId),
                              homeSectionStyles: nextHomeSectionStyles,
                              homeSectionGroups: settings.homeSectionGroups.map((group) => ({
                                ...group,
                                sectionIds: group.sectionIds.filter((sectionId) => sectionId !== deletedSectionOrderId),
                              })),
                            };
                          })
                        }
                        className="rounded-full border border-red-200 px-3 py-2 text-xs font-bold text-red-700"
                      >
                        حذف
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="عنوان السكشن">
                      <input
                        value={section.title}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id ? { ...item, title: event.target.value } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                    <Field label="النص الصغير">
                      <input
                        value={section.subtitle}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id ? { ...item, subtitle: event.target.value } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                  </div>

                  <Field label="رابط أو slug التصنيف">
                    <input
                      value={section.categorySlug}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          customSections: settings.customSections.map((item) =>
                            item.id === section.id ? { ...item, categorySlug: extractCategorySlug(event.target.value) } : item,
                          ),
                        })
                      }
                      placeholder="مثال: cups أو رابط تصنيف القهوة"
                      className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                    />
                  </Field>

                  <div className="grid gap-4 lg:grid-cols-4">
                    <Field label="عدد المنتجات">
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={section.productLimit}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id ? { ...item, productLimit: Number(event.target.value) } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                    <Field label="عدد الصفوف">
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={section.rowCount}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id ? { ...item, rowCount: Number(event.target.value) } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                    <Field label="طريقة عرض المنتجات">
                      <select
                        value={section.displayMode}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id ? { ...item, displayMode: event.target.value as "grid" | "carousel" } : item,
                            ),
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      >
                        <option value="grid">شبكة منتجات</option>
                        <option value="carousel">صف سكرول</option>
                      </select>
                    </Field>
                    {[
                      ["أعمدة ديسكتوب", "desktopColumns"],
                      ["أعمدة تابلت", "tabletColumns"],
                      ["أعمدة موبايل", "mobileColumns"],
                    ].map(([label, key]) => (
                      <Field key={key} label={String(label)}>
                        <input
                          type="number"
                          min={1}
                          value={section[key as "desktopColumns" | "tabletColumns" | "mobileColumns"]}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              customSections: settings.customSections.map((item) =>
                                item.id === section.id ? { ...item, [key]: Number(event.target.value) } : item,
                              ),
                            })
                          }
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        />
                      </Field>
                    ))}
                  </div>

                  <div className="grid gap-4 rounded-2xl border border-black/10 bg-white p-4">
                    <label className="flex items-center gap-3 text-sm font-bold text-zinc-800">
                      <input
                        type="checkbox"
                        checked={section.sideBanner.enabled}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id
                                ? { ...item, sideBanner: { ...item.sideBanner, enabled: event.target.checked } }
                                : item,
                            ),
                          })
                        }
                      />
                      تفعيل بنر جانبي صغير بجانب منتجات السكشن
                    </label>
                    <p className="text-sm leading-6 text-zinc-500">
                      مقاس مقترح: 400x500px أو 500x650px. يظهر بحجم قريب من كارت المنتج، ويمكن وضعه يمين أو يسار المنتجات. أعداد الأعمدة مفتوحة، لكن الأرقام الكبيرة تجعل الكروت أصغر.
                    </p>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Field label="موضع البنر الجانبي">
                        <select
                          value={section.sideBanner.position}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              customSections: settings.customSections.map((item) =>
                                item.id === section.id
                                  ? { ...item, sideBanner: { ...item.sideBanner, position: event.target.value as "left" | "right" } }
                                  : item,
                              ),
                            })
                          }
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        >
                          <option value="right">يمين المنتجات</option>
                          <option value="left">يسار المنتجات</option>
                        </select>
                      </Field>
                      <Field label="رابط البنر الجانبي - اختياري">
                        <input
                          value={section.sideBanner.linkUrl}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              customSections: settings.customSections.map((item) =>
                                item.id === section.id
                                  ? { ...item, sideBanner: { ...item.sideBanner, linkUrl: event.target.value } }
                                  : item,
                              ),
                            })
                          }
                          placeholder="/shop أو رابط تصنيف"
                          className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                        />
                      </Field>
                    </div>
                    <label className="flex items-center gap-3 text-sm font-bold text-zinc-800">
                      <input
                        type="checkbox"
                        checked={section.sideBanner.showOnMobile}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id
                                ? { ...item, sideBanner: { ...item.sideBanner, showOnMobile: event.target.checked } }
                                : item,
                            ),
                          })
                        }
                      />
                      إظهار البنر الجانبي في الموبايل
                    </label>
                    <BannerSpacingFields
                      label="مسافات البنر الجانبي"
                      spacing={section.sideBanner.spacing}
                      showGapToContent
                      onChange={(spacing) =>
                        setSettings({
                          ...settings,
                          customSections: settings.customSections.map((item) =>
                            item.id === section.id ? { ...item, sideBanner: { ...item.sideBanner, spacing } } : item,
                          ),
                        })
                      }
                    />
                    <ImageUploadField
                      label="صورة البنر الجانبي"
                      value={section.sideBanner.image}
                      purpose={`custom-section-${section.id}-side-banner`}
                      recommendation="400x500px أو 500x650px"
                      aspectRatio="4:5"
                      onUploaded={(url) =>
                        setSettings({
                          ...settings,
                          customSections: settings.customSections.map((item) =>
                            item.id === section.id
                              ? { ...item, sideBanner: { ...item.sideBanner, image: url } }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>

                  <div className="grid gap-4 rounded-2xl border border-black/10 bg-white p-4">
                    <label className="flex items-center gap-3 text-sm font-bold text-zinc-800">
                      <input
                        type="checkbox"
                        checked={section.showMainBanner}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id ? { ...item, showMainBanner: event.target.checked } : item,
                            ),
                          })
                        }
                      />
                      إظهار بنر كبير فوق منتجات السكشن
                    </label>

                    {section.showMainBanner ? (
                      <div className="grid gap-4">
                        <BannerSpacingFields
                          label="مسافات البنر الكبير"
                          spacing={section.mainBannerSpacing}
                          showGapToContent
                          onChange={(mainBannerSpacing) =>
                            setSettings({
                              ...settings,
                              customSections: settings.customSections.map((item) =>
                                item.id === section.id ? { ...item, mainBannerSpacing } : item,
                              ),
                            })
                          }
                        />
                        <MultilineTextField
                          label="النص فوق البنر الكبير"
                          value={section.text}
                          onChange={(value) =>
                            setSettings({
                              ...settings,
                              customSections: settings.customSections.map((item) =>
                                item.id === section.id ? { ...item, text: value } : item,
                              ),
                            })
                          }
                        />

                        <div className="grid gap-4 lg:grid-cols-4">
                          <Field label="لون خلفية البنر">
                            <input
                              type="color"
                              value={section.backgroundColor}
                              onChange={(event) =>
                                setSettings({
                                  ...settings,
                                  customSections: settings.customSections.map((item) =>
                                    item.id === section.id ? { ...item, backgroundColor: event.target.value } : item,
                                  ),
                                })
                              }
                              className="h-12 rounded-xl border border-black/10 px-2"
                            />
                          </Field>
                          <Field label="لون نص البنر">
                            <input
                              type="color"
                              value={section.textColor}
                              onChange={(event) =>
                                setSettings({
                                  ...settings,
                                  customSections: settings.customSections.map((item) =>
                                    item.id === section.id ? { ...item, textColor: event.target.value } : item,
                                  ),
                                })
                              }
                              className="h-12 rounded-xl border border-black/10 px-2"
                            />
                          </Field>
                          <Field label="رابط الضغط على البنر الكبير">
                            <input
                              value={section.linkUrl}
                              onChange={(event) =>
                                setSettings({
                                  ...settings,
                                  customSections: settings.customSections.map((item) =>
                                    item.id === section.id ? { ...item, linkUrl: event.target.value } : item,
                                  ),
                                })
                              }
                              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                            />
                          </Field>
                          {[
                            ["فونت ديسكتوب", "fontSizeDesktop", "48-64px"],
                            ["فونت تابلت", "fontSizeTablet", "36-48px"],
                            ["فونت موبايل", "fontSizeMobile", "28-36px"],
                          ].map(([label, key, hint]) => (
                            <Field key={key} label={`${label} - مقترح ${hint}`}>
                              <input
                                type="number"
                                value={section[key as "fontSizeDesktop" | "fontSizeTablet" | "fontSizeMobile"]}
                                onChange={(event) =>
                                  setSettings({
                                    ...settings,
                                    customSections: settings.customSections.map((item) =>
                                      item.id === section.id ? { ...item, [key]: Number(event.target.value) } : item,
                                    ),
                                  })
                                }
                                className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                              />
                            </Field>
                          ))}
                        </div>

                        <ImageUploadField
                          label="صورة البنر الكبير - ديسكتوب"
                          value={section.desktopImage}
                          purpose={`custom-section-${section.id}-desktop`}
                          recommendation="1600x500px أو 1920x600px"
                          aspectRatio="16:5"
                          onUploaded={(url) =>
                            setSettings({
                              ...settings,
                              customSections: settings.customSections.map((item) =>
                                item.id === section.id ? { ...item, desktopImage: url } : item,
                              ),
                            })
                          }
                        />
                        <ImageUploadField
                          label="صورة البنر الكبير - تابلت"
                          value={section.tabletImage}
                          purpose={`custom-section-${section.id}-tablet`}
                          recommendation="1200x600px"
                          aspectRatio="2:1"
                          onUploaded={(url) =>
                            setSettings({
                              ...settings,
                              customSections: settings.customSections.map((item) =>
                                item.id === section.id ? { ...item, tabletImage: url } : item,
                              ),
                            })
                          }
                        />
                        <ImageUploadField
                          label="صورة البنر الكبير - موبايل"
                          value={section.mobileImage}
                          purpose={`custom-section-${section.id}-mobile`}
                          recommendation="750x900px"
                          aspectRatio="5:6"
                          onUploaded={(url) =>
                            setSettings({
                              ...settings,
                              customSections: settings.customSections.map((item) =>
                                item.id === section.id ? { ...item, mobileImage: url } : item,
                              ),
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {focus === "header" ? (
        <section className="grid gap-5 rounded-xl border border-black/10 bg-white p-6 shadow-sm lg:grid-cols-2">
          <Field label="نص زر الهيدر">
            <input
              value={settings.header.ctaText}
              onChange={(event) =>
                setSettings({ ...settings, header: { ...settings.header, ctaText: event.target.value } })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <Field label="رابط زر الهيدر">
            <input
              value={settings.header.ctaUrl}
              onChange={(event) =>
                setSettings({ ...settings, header: { ...settings.header, ctaUrl: event.target.value } })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={settings.header.showCart}
              onChange={(event) =>
                setSettings({ ...settings, header: { ...settings.header, showCart: event.target.checked } })
              }
            />
            إظهار السلة في الهيدر
          </label>
          <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={settings.header.mobileShowCart}
              onChange={(event) =>
                setSettings({ ...settings, header: { ...settings.header, mobileShowCart: event.target.checked } })
              }
            />
            إظهار السلة في هيدر الموبايل
          </label>
          <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={settings.header.mobileShowSearch}
              onChange={(event) =>
                setSettings({ ...settings, header: { ...settings.header, mobileShowSearch: event.target.checked } })
              }
            />
            إظهار البحث في الموبايل
          </label>
        </section>
      ) : null}

      {focus === "banners" ? (
        <section className="grid gap-6">
          <article className="grid gap-5 rounded-xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-950">بنر الواجهة الرئيسي</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  يظهر كصورة كبيرة في صدر الموقع مثل واجهة sokany.com.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    const nextSettings = { ...settings, hero: { ...settings.hero, enabled: false } };
                    setSettings(nextSettings);
                    void saveSettings(nextSettings, "تمت إزالة بنر الواجهة الرئيسي من الفرونت اند.");
                  }}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
                >
                  إزالة من الفرونت اند
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => saveSettings(settings, "تم حفظ بنر الواجهة الرئيسي.")}
                  className="rounded-xl bg-brand-gold px-4 py-2 text-sm font-bold text-black transition hover:bg-brand-gold-dark"
                >
                  حفظ هذا البنر
                </button>
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
              <input
                type="checkbox"
                checked={settings.hero.enabled}
                onChange={(event) =>
                  setSettings({ ...settings, hero: { ...settings.hero, enabled: event.target.checked } })
                }
              />
              إظهار بنر الواجهة الرئيسي
            </label>
            <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
              <input
                type="checkbox"
                checked={settings.hero.showTextOnDesktop}
                onChange={(event) =>
                  setSettings({ ...settings, hero: { ...settings.hero, showTextOnDesktop: event.target.checked } })
                }
              />
              إظهار نصوص البنر على الديسكتوب
            </label>
            <div className="grid gap-5 lg:grid-cols-2">
              <MultilineTextField
                label="عنوان البنر"
                value={settings.hero.title}
                onChange={(value) => setSettings({ ...settings, hero: { ...settings.hero, title: value } })}
                className="min-h-24 rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
              />
              <MultilineTextField
                label="النص الصغير فوق العنوان"
                value={settings.hero.eyebrow}
                onChange={(value) => setSettings({ ...settings, hero: { ...settings.hero, eyebrow: value } })}
                className="min-h-20 rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
              />
            </div>
            <MultilineTextField
              label="وصف البنر"
              value={settings.hero.subtitle}
              onChange={(value) => setSettings({ ...settings, hero: { ...settings.hero, subtitle: value } })}
              className="min-h-28 rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
            <div className="grid gap-5 lg:grid-cols-2">
              <MultilineTextField
                label="نص زر التسوق"
                value={settings.hero.primaryCtaText}
                onChange={(value) => setSettings({ ...settings, hero: { ...settings.hero, primaryCtaText: value } })}
              />
              <Field label="رابط زر التسوق">
                <input
                  value={settings.hero.primaryCtaUrl}
                  onChange={(event) =>
                    setSettings({ ...settings, hero: { ...settings.hero, primaryCtaUrl: event.target.value } })
                  }
                  className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                />
              </Field>
              <MultilineTextField
                label="نص زر التواصل"
                value={settings.hero.secondaryCtaText}
                onChange={(value) =>
                  setSettings({ ...settings, hero: { ...settings.hero, secondaryCtaText: value } })
                }
              />
              <Field label="رابط زر التواصل">
                <input
                  value={settings.hero.secondaryCtaUrl}
                  onChange={(event) =>
                    setSettings({ ...settings, hero: { ...settings.hero, secondaryCtaUrl: event.target.value } })
                  }
                  className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                />
              </Field>
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              <Field label="مكان كتلة النص">
                <select
                  value={settings.hero.contentAlign}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      hero: {
                        ...settings.hero,
                        contentAlign: event.target.value as "right" | "center" | "left",
                      },
                    })
                  }
                  className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                >
                  <option value="right">يمين</option>
                  <option value="center">وسط</option>
                  <option value="left">يسار</option>
                </select>
              </Field>
              <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={settings.hero.overlayEnabled}
                  onChange={(event) =>
                    setSettings({ ...settings, hero: { ...settings.hero, overlayEnabled: event.target.checked } })
                  }
                />
                تفعيل طبقة غامقة فوق الصورة
              </label>
              <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={settings.hero.frameEnabled}
                  onChange={(event) =>
                    setSettings({ ...settings, hero: { ...settings.hero, frameEnabled: event.target.checked } })
                  }
                />
                إظهار إطار حول نص البنر
              </label>
              <Field label="لون النص فوق الصورة">
                <select
                  value={settings.hero.textTone}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      hero: { ...settings.hero, textTone: event.target.value as "light" | "dark" },
                    })
                  }
                  className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                >
                  <option value="light">فاتح للصورة الغامقة</option>
                  <option value="dark">غامق للصورة الفاتحة</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-5 rounded-2xl border border-black/10 bg-zinc-50 p-4 lg:grid-cols-3">
              <div className="lg:col-span-3">
                <h3 className="text-lg font-bold text-zinc-950">إعدادات البنر على الموبايل</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  هذه الإعدادات تتحكم في مكان وحجم النص والأزرار على الموبايل فقط بدون التأثير على الديسكتوب.
                </p>
              </div>
              <label className="flex items-center gap-3 rounded-xl bg-white p-4 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={settings.hero.showTextOnMobile}
                  onChange={(event) =>
                    setSettings({ ...settings, hero: { ...settings.hero, showTextOnMobile: event.target.checked } })
                  }
                />
                إظهار نصوص البنر على الموبايل
              </label>
              <Field label="مكان النص على الموبايل">
                <select
                  value={settings.hero.mobileContentAlign}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      hero: {
                        ...settings.hero,
                        mobileContentAlign: event.target.value as "right" | "center" | "left",
                      },
                    })
                  }
                  className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                >
                  <option value="right">يمين</option>
                  <option value="center">وسط</option>
                  <option value="left">يسار</option>
                </select>
              </Field>
              {[
                ["حجم عنوان الموبايل px", "mobileTitleFontSize"],
                ["حجم وصف الموبايل px", "mobileSubtitleFontSize"],
                ["حجم خط أزرار الموبايل px", "mobileButtonFontSize"],
                ["عرض Padding أزرار الموبايل px", "mobileButtonPaddingX"],
                ["ارتفاع Padding أزرار الموبايل px", "mobileButtonPaddingY"],
              ].map(([label, key]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    min={1}
                    value={settings.hero[key as "mobileTitleFontSize" | "mobileSubtitleFontSize" | "mobileButtonFontSize" | "mobileButtonPaddingX" | "mobileButtonPaddingY"]}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        hero: {
                          ...settings.hero,
                          [key]: Number(event.target.value),
                        },
                      })
                    }
                    className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                  />
                </Field>
              ))}
            </div>
            <BannerSpacingFields
              label="تحريك البنر عمودياً وأفقياً"
              spacing={{
                spacingTop: getSectionStyle(settings, "hero").spacingTop,
                spacingBottom: getSectionStyle(settings, "hero").spacingBottom,
                paddingLeft: getSectionStyle(settings, "hero").paddingLeft,
                paddingRight: getSectionStyle(settings, "hero").paddingRight,
                gapToContent: 0,
              }}
              onChange={(spacing) => {
                const heroStyle = getSectionStyle(settings, "hero");
                setSettings({
                  ...settings,
                  homeSectionStyles: {
                    ...settings.homeSectionStyles,
                    hero: {
                      ...heroStyle,
                      spacingTop: spacing.spacingTop,
                      spacingBottom: spacing.spacingBottom,
                      paddingLeft: spacing.paddingLeft,
                      paddingRight: spacing.paddingRight,
                    },
                  },
                });
              }}
            />
            <Field label="تخطيط البنر الرئيسي">
              <select
                value={settings.hero.layoutMode}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    hero: {
                      ...settings.hero,
                      layoutMode: event.target.value as "full" | "split",
                    },
                  })
                }
                className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
              >
                <option value="full">عرض كامل (الوضع الحالي)</option>
                <option value="split">مقسّم: كاروسيل 70% + بنران 30%</option>
              </select>
            </Field>
            <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-black/10 bg-zinc-50 text-right">
                    <th className="px-4 py-3 font-bold">العنصر</th>
                    <th className="px-4 py-3 font-bold">Desktop</th>
                    <th className="px-4 py-3 font-bold">Tablet</th>
                    <th className="px-4 py-3 font-bold">Mobile</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-700">
                  <tr className="border-b border-black/5">
                    <td className="px-4 py-3">كarousel — وضع full</td>
                    <td className="px-4 py-3">1920×800</td>
                    <td className="px-4 py-3">1920×800</td>
                    <td className="px-4 py-3">1920×800</td>
                  </tr>
                  <tr className="border-b border-black/5">
                    <td className="px-4 py-3">كاروسيل — وضع split (70%)</td>
                    <td className="px-4 py-3">1920×800</td>
                    <td className="px-4 py-3">1920×800</td>
                    <td className="px-4 py-3">1920×1080</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">بنر جانبي (كل واحد)</td>
                    <td className="px-4 py-3">ارتفاع تلقائي</td>
                    <td className="px-4 py-3">ارتفاع تلقائي</td>
                    <td className="px-4 py-3">~750×260</td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t border-black/10 px-4 py-3 text-xs leading-6 text-zinc-500">
                صورة كاروسيل 1920×800 للديسكتوب. على الموبايل في وضع split يُعرض الكاروسيل بنسبة 1920×1080.
                في وضع split: ارتفاع البنرين الجانبيين يتناسب مع ارتفاع الكاروسيل تلقائياً على الديسكتوب.
                في وضع split لا يظهر النص فوق البنر — ضع النص داخل الصورة.
                الفيديو: MP4 أو WebM، مدة قصيرة 5–15 ثانية، بدون صوت.
                على الموبايل: الكاروسيل أولاً ثم البنران تحت بعض.
              </p>
            </div>
            {settings.hero.layoutMode === "split" ? (
              <div className="grid gap-4 rounded-2xl border border-black/10 bg-zinc-50 p-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-950">البنران الجانبيان (30% يسار)</h3>
                  <p className="mt-1 text-sm text-zinc-500">يظهران فقط عند رفع صورة لكل بنر على الأقل.</p>
                </div>
                {settings.hero.sideBanners.map((banner, bannerIndex) => (
                  <div key={banner.id} className="grid gap-4 rounded-2xl border border-black/10 bg-white p-4">
                    <h4 className="text-base font-bold text-zinc-950">البنر الجانبي {bannerIndex + 1}</h4>
                    <Field label="رابط البنر - اختياري">
                      <input
                        value={banner.linkUrl}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            hero: {
                              ...settings.hero,
                              sideBanners: settings.hero.sideBanners.map((item, index) =>
                                index === bannerIndex ? { ...item, linkUrl: event.target.value } : item,
                              ) as ThemeSettings["hero"]["sideBanners"],
                            },
                          })
                        }
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                    <ImageUploadField
                      label={`صورة البنر الجانبي ${bannerIndex + 1}`}
                      value={banner.image}
                      purpose={`hero-side-${banner.id}`}
                      recommendation="ارتفاع تلقائي desktop | ~700x320px mobile"
                      aspectRatio="8:5"
                      onUploaded={(url) =>
                        setSettings({
                          ...settings,
                          hero: {
                            ...settings.hero,
                            sideBanners: settings.hero.sideBanners.map((item, index) =>
                              index === bannerIndex ? { ...item, image: url } : item,
                            ) as ThemeSettings["hero"]["sideBanners"],
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <div className="grid gap-4 rounded-2xl border border-black/10 bg-zinc-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-zinc-950">شرائح البنر (كاروسيل)</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    أضف أكثر من شريحة لتتحول تلقائياً إلى كاروسيل. النص والأزرار مشتركة فوق كل الشرائح.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      hero: syncHeroWithSlides(settings.hero, [...settings.hero.slides, createHeroSlide()]),
                    })
                  }
                  className="rounded-xl border border-black/10 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:border-brand-gold"
                >
                  إضافة شريحة
                </button>
              </div>
              <Field label="مدة التبديل بين الشرائح بالثواني">
                <input
                  type="number"
                  min={3}
                  max={30}
                  value={settings.hero.carouselIntervalSeconds}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      hero: {
                        ...settings.hero,
                        carouselIntervalSeconds: Math.min(30, Math.max(3, Number(event.target.value) || 6)),
                      },
                    })
                  }
                  className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                />
              </Field>
              {settings.hero.slides.map((slide, slideIndex) => (
                <div key={slide.id} className="grid gap-4 rounded-2xl border border-black/10 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-base font-bold text-zinc-950">الشريحة {slideIndex + 1}</h4>
                    {settings.hero.slides.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const nextSlides = settings.hero.slides.filter((item) => item.id !== slide.id);
                          setSettings({
                            ...settings,
                            hero: syncHeroWithSlides(settings.hero, nextSlides.length ? nextSlides : [createHeroSlide()]),
                          });
                        }}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
                      >
                        حذف الشريحة
                      </button>
                    ) : null}
                  </div>
                  <Field label="رابط الشريحة - اختياري">
                    <input
                      value={slide.linkUrl}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          hero: syncHeroWithSlides(
                            settings.hero,
                            settings.hero.slides.map((item) =>
                              item.id === slide.id ? { ...item, linkUrl: event.target.value } : item,
                            ),
                          ),
                        })
                      }
                      className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                    />
                  </Field>
                  <Field label="نوع الوسائط">
                    <select
                      value={slide.mediaType}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          hero: syncHeroWithSlides(
                            settings.hero,
                            settings.hero.slides.map((item) =>
                              item.id === slide.id
                                ? { ...item, mediaType: event.target.value as HeroMediaType }
                                : item,
                            ),
                          ),
                        })
                      }
                      className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                    >
                      <option value="image">صورة</option>
                      <option value="video">فيديو</option>
                    </select>
                  </Field>
                  {slide.mediaType === "video" ? (
                    <>
                      <MediaUploadField
                        label={`فيديو الشريحة ${slideIndex + 1} - ديسكتوب`}
                        value={slide.desktopVideo}
                        purpose={`hero-desktop-video-${slide.id}`}
                        recommendation={getHeroCarouselRecommendations(settings.hero.layoutMode).desktop}
                        aspectRatio={getHeroCarouselRecommendations(settings.hero.layoutMode).desktopRatio}
                        mediaType="video"
                        onUploaded={(url) =>
                          setSettings({
                            ...settings,
                            hero: syncHeroWithSlides(
                              settings.hero,
                              settings.hero.slides.map((item) =>
                                item.id === slide.id ? { ...item, desktopVideo: url } : item,
                              ),
                            ),
                          })
                        }
                      />
                      <MediaUploadField
                        label={`فيديو الشريحة ${slideIndex + 1} - تابلت`}
                        value={slide.tabletVideo}
                        purpose={`hero-tablet-video-${slide.id}`}
                        recommendation={getHeroCarouselRecommendations(settings.hero.layoutMode).tablet}
                        aspectRatio={getHeroCarouselRecommendations(settings.hero.layoutMode).tabletRatio}
                        mediaType="video"
                        onUploaded={(url) =>
                          setSettings({
                            ...settings,
                            hero: syncHeroWithSlides(
                              settings.hero,
                              settings.hero.slides.map((item) =>
                                item.id === slide.id ? { ...item, tabletVideo: url } : item,
                              ),
                            ),
                          })
                        }
                      />
                      <MediaUploadField
                        label={`فيديو الشريحة ${slideIndex + 1} - موبايل`}
                        value={slide.mobileVideo}
                        purpose={`hero-mobile-video-${slide.id}`}
                        recommendation={getHeroCarouselRecommendations(settings.hero.layoutMode).mobile}
                        aspectRatio={getHeroCarouselRecommendations(settings.hero.layoutMode).mobileRatio}
                        mediaType="video"
                        onUploaded={(url) =>
                          setSettings({
                            ...settings,
                            hero: syncHeroWithSlides(
                              settings.hero,
                              settings.hero.slides.map((item) =>
                                item.id === slide.id ? { ...item, mobileVideo: url } : item,
                              ),
                            ),
                          })
                        }
                      />
                      <ImageUploadField
                        label={`صورة بديلة للشريحة ${slideIndex + 1} - ديسكتوب (اختياري)`}
                        value={slide.desktopImage}
                        purpose={`hero-desktop-fallback-${slide.id}`}
                        recommendation={getHeroCarouselRecommendations(settings.hero.layoutMode).desktop}
                        aspectRatio={getHeroCarouselRecommendations(settings.hero.layoutMode).desktopRatio}
                        onUploaded={(url) =>
                          setSettings({
                            ...settings,
                            hero: syncHeroWithSlides(
                              settings.hero,
                              settings.hero.slides.map((item) =>
                                item.id === slide.id ? { ...item, desktopImage: url } : item,
                              ),
                            ),
                          })
                        }
                      />
                    </>
                  ) : (
                    <>
                      <ImageUploadField
                        label={`صورة الشريحة ${slideIndex + 1} - ديسكتوب`}
                        value={slide.desktopImage}
                        purpose={`hero-desktop-${slide.id}`}
                        recommendation={getHeroCarouselRecommendations(settings.hero.layoutMode).desktop}
                        aspectRatio={getHeroCarouselRecommendations(settings.hero.layoutMode).desktopRatio}
                        onUploaded={(url) =>
                          setSettings({
                            ...settings,
                            hero: syncHeroWithSlides(
                              settings.hero,
                              settings.hero.slides.map((item) =>
                                item.id === slide.id ? { ...item, desktopImage: url } : item,
                              ),
                            ),
                          })
                        }
                      />
                      <ImageUploadField
                        label={`صورة الشريحة ${slideIndex + 1} - تابلت`}
                        value={slide.tabletImage}
                        purpose={`hero-tablet-${slide.id}`}
                        recommendation={getHeroCarouselRecommendations(settings.hero.layoutMode).tablet}
                        aspectRatio={getHeroCarouselRecommendations(settings.hero.layoutMode).tabletRatio}
                        onUploaded={(url) =>
                          setSettings({
                            ...settings,
                            hero: syncHeroWithSlides(
                              settings.hero,
                              settings.hero.slides.map((item) =>
                                item.id === slide.id ? { ...item, tabletImage: url } : item,
                              ),
                            ),
                          })
                        }
                      />
                      <ImageUploadField
                        label={`صورة الشريحة ${slideIndex + 1} - موبايل`}
                        value={slide.mobileImage}
                        purpose={`hero-mobile-${slide.id}`}
                        recommendation={getHeroCarouselRecommendations(settings.hero.layoutMode).mobile}
                        aspectRatio={getHeroCarouselRecommendations(settings.hero.layoutMode).mobileRatio}
                        onUploaded={(url) =>
                          setSettings({
                            ...settings,
                            hero: syncHeroWithSlides(
                              settings.hero,
                              settings.hero.slides.map((item) =>
                                item.id === slide.id ? { ...item, mobileImage: url } : item,
                              ),
                            ),
                          })
                        }
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </article>

          <article className="grid gap-5 rounded-xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-950">بنر أعلى الهيدر</h2>
                <p className="mt-1 text-sm text-zinc-500">بنر رفيع أعلى الموقع.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    const nextSettings = { ...settings, topBanner: { ...settings.topBanner, enabled: false } };
                    setSettings(nextSettings);
                    void saveSettings(nextSettings, "تمت إزالة بنر أعلى الهيدر من الفرونت اند.");
                  }}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
                >
                  إزالة من الفرونت اند
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => saveSettings(settings, "تم حفظ بنر أعلى الهيدر.")}
                  className="rounded-xl bg-brand-gold px-4 py-2 text-sm font-bold text-black transition hover:bg-brand-gold-dark"
                >
                  حفظ هذا البنر
                </button>
              </div>
            </div>
            <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
              <input
                type="checkbox"
                checked={settings.topBanner.enabled}
                onChange={(event) =>
                  setSettings({ ...settings, topBanner: { ...settings.topBanner, enabled: event.target.checked } })
                }
              />
              إظهار بنر أعلى الهيدر
            </label>
            <BannerSpacingFields
              label="مسافات البنر العلوي"
              spacing={settings.topBanner.spacing}
              onChange={(spacing) =>
                setSettings({ ...settings, topBanner: { ...settings.topBanner, spacing } })
              }
            />
            <MultilineTextField
              label="جمل التوب بار أعلى الهيدر"
              value={settings.topBanner.text}
              onChange={(value) => setSettings({ ...settings, topBanner: { ...settings.topBanner, text: value } })}
            />
            <p className="-mt-3 text-xs font-semibold text-zinc-500">
              اكتب كل جملة في سطر مستقل، أو افصل بين الجمل بعلامة •. في الوضع الثابت تظهر كل الجمل مرة واحدة في منتصف الشريط.
            </p>
            <Field label="طريقة عرض الجمل">
              <select
                value={settings.topBanner.textAnimation}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    topBanner: {
                      ...settings.topBanner,
                      textAnimation: event.target.value === "static" ? "static" : "marquee",
                    },
                  })
                }
                className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
              >
                <option value="marquee">جمل متحركة (ماركوي)</option>
                <option value="static">جمل ثابتة بدون حركة</option>
              </select>
            </Field>
            <div
              className={`grid gap-4 md:grid-cols-1 ${settings.topBanner.textAnimation === "static" ? "pointer-events-none opacity-50" : ""}`}
            >
              <Field label="سرعة حركة التوب بار بالثواني">
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={settings.topBanner.speedSeconds}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      topBanner: {
                        ...settings.topBanner,
                        speedSeconds: Math.min(120, Math.max(10, Number(event.target.value) || 40)),
                      },
                    })
                  }
                  className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                />
              </Field>
            </div>
            <p className={`-mt-2 text-xs font-semibold text-zinc-500 ${settings.topBanner.textAnimation === "static" ? "opacity-50" : ""}`}>
              الجمل تتكرر بشكل متصل بدون فجوة بين آخر جملة وأول جملة.
            </p>
            <ImageUploadField
              label="صورة بنر أعلى الهيدر - ديسكتوب"
              value={settings.topBanner.desktopImage}
              purpose="top-banner-desktop"
              recommendation="1920x120px"
              aspectRatio="16:1"
              onUploaded={(url) =>
                setSettings({ ...settings, topBanner: { ...settings.topBanner, desktopImage: url, enabled: true } })
              }
            />
            <ImageUploadField
              label="صورة بنر أعلى الهيدر - موبايل"
              value={settings.topBanner.mobileImage}
              purpose="top-banner-mobile"
              recommendation="750x160px"
              aspectRatio="4.7:1"
              onUploaded={(url) =>
                setSettings({ ...settings, topBanner: { ...settings.topBanner, mobileImage: url, enabled: true } })
              }
            />
          </article>

          <article className="grid gap-5 rounded-xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-950">بنر العروض العام</h2>
                <p className="mt-1 text-sm text-zinc-500">بنر عريض داخل الصفحة الرئيسية.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    const nextSettings = {
                      ...settings,
                      sections: {
                        ...settings.sections,
                        customBanner: { ...settings.sections.customBanner, enabled: false },
                      },
                    };
                    setSettings(nextSettings);
                    void saveSettings(nextSettings, "تمت إزالة بنر العروض العام من الفرونت اند.");
                  }}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
                >
                  إزالة من الفرونت اند
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => saveSettings(settings, "تم حفظ بنر العروض العام.")}
                  className="rounded-xl bg-brand-gold px-4 py-2 text-sm font-bold text-black transition hover:bg-brand-gold-dark"
                >
                  حفظ هذا البنر
                </button>
              </div>
            </div>
            <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
              <input
                type="checkbox"
                checked={settings.sections.customBanner.enabled}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    sections: {
                      ...settings.sections,
                      customBanner: {
                        ...settings.sections.customBanner,
                        enabled: event.target.checked,
                      },
                    },
                  })
                }
              />
              إظهار بنر العروض العام
            </label>
            <BannerSpacingFields
              label="مسافات بنر العروض"
              spacing={settings.sections.customBanner.spacing}
              showGapToContent
              onChange={(spacing) =>
                setSettings({
                  ...settings,
                  sections: {
                    ...settings.sections,
                    customBanner: {
                      ...settings.sections.customBanner,
                      spacing,
                    },
                  },
                })
              }
            />
            <ImageUploadField
              label="بنر عروض عام - ديسكتوب"
              value={settings.sections.customBanner.desktopImage}
              purpose="custom-banner-desktop"
              recommendation="1600x500px"
              aspectRatio="16:5"
              onUploaded={(url) =>
                setSettings({
                  ...settings,
                  sections: {
                    ...settings.sections,
                    customBanner: { ...settings.sections.customBanner, desktopImage: url, enabled: true },
                  },
                })
              }
            />
            <ImageUploadField
              label="بنر عروض عام - موبايل"
              value={settings.sections.customBanner.mobileImage}
              purpose="custom-banner-mobile"
              recommendation="750x750px"
              aspectRatio="1:1"
              onUploaded={(url) =>
                setSettings({
                  ...settings,
                  sections: {
                    ...settings.sections,
                    customBanner: { ...settings.sections.customBanner, mobileImage: url, enabled: true },
                  },
                })
              }
            />
          </article>
        </section>
      ) : null}

      {focus === "footer" ? (
        <section className="grid gap-5 rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <Field label="وصف الفوتر">
            <textarea
              value={settings.footer.description}
              onChange={(event) =>
                setSettings({ ...settings, footer: { ...settings.footer, description: event.target.value } })
              }
              className="min-h-28 rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <Field label="حقوق الملكية">
            <input
              value={settings.footer.copyright}
              onChange={(event) =>
                setSettings({ ...settings, footer: { ...settings.footer, copyright: event.target.value } })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
        </section>
      ) : null}

      {focus === "navigation" ? (
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <Field label="المنيو - كل سطر بصيغة: الاسم | الرابط">
            <textarea
              value={navigationText}
              onChange={(event) => setNavigationText(event.target.value)}
              className="min-h-64 rounded-xl border border-black/10 px-4 py-3 font-mono text-sm outline-none focus:border-brand-gold"
            />
          </Field>
        </section>
      ) : null}

      {focus === "socialMedia" ? (
        <section className="grid gap-5 rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-zinc-950">شريط السوشيال ميديا (يسار الشاشة)</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-600">
              تظهر الأيقونات على يسار الموقع فقط للروابط المملوءة. اترك الرابط فارغاً لإخفاء المنصة.
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={settings.socialMedia.enabled}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  socialMedia: { ...settings.socialMedia, enabled: event.target.checked },
                })
              }
            />
            تفعيل شريط السوشيال ميديا
          </label>

          <Field label="رابط Facebook">
            <input
              value={settings.socialMedia.facebookUrl}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  socialMedia: { ...settings.socialMedia, facebookUrl: event.target.value },
                })
              }
              placeholder="https://facebook.com/sokany"
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>

          <Field label="رابط Instagram">
            <input
              value={settings.socialMedia.instagramUrl}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  socialMedia: { ...settings.socialMedia, instagramUrl: event.target.value },
                })
              }
              placeholder="https://instagram.com/sokany"
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>

          <Field label="رابط TikTok">
            <input
              value={settings.socialMedia.tiktokUrl}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  socialMedia: { ...settings.socialMedia, tiktokUrl: event.target.value },
                })
              }
              placeholder="https://tiktok.com/@sokany"
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>

          <div className="border-t border-black/10 pt-5">
            <h2 className="text-xl font-bold text-zinc-950">الأزرار العائمة (أسفل يمين الشاشة)</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-600">
              زر واتساب يفتح محادثة مع رقم الشركة. زر الصعود للأعلى يظهر بعد التمرير لأسفل الصفحة.
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={settings.floatingActions.whatsappEnabled}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  floatingActions: { ...settings.floatingActions, whatsappEnabled: event.target.checked },
                })
              }
            />
            تفعيل زر واتساب
          </label>

          <Field label="رقم واتساب الشركة">
            <input
              value={settings.floatingActions.whatsappPhone}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  floatingActions: { ...settings.floatingActions, whatsappPhone: event.target.value },
                })
              }
              placeholder="01101115311"
              dir="ltr"
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>

          <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={settings.floatingActions.scrollTopEnabled}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  floatingActions: { ...settings.floatingActions, scrollTopEnabled: event.target.checked },
                })
              }
            />
            تفعيل زر الصعود للأعلى
          </label>
        </section>
      ) : null}

      {status ? <p className="rounded-xl bg-zinc-950 px-4 py-3 text-sm text-white">{status}</p> : null}

      {focus !== "banners" ? (
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-xl bg-brand-gold px-6 py-3 text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:opacity-60"
        >
          {isSaving ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </button>
      ) : null}
    </form>
  );
}

