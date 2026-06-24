"use client";

import { FormEvent, useId, useMemo, useRef, useState } from "react";

import type { CustomHomeSection, HomeSectionId, MenuItem, ThemeSettings } from "@/lib/theme-settings";

import { ImageUploadField } from "./image-upload-field";

type SettingsFormProps = {
  settings: ThemeSettings;
  focus: "theme" | "header" | "footer" | "banners" | "navigation";
};

const sectionLabels: Record<HomeSectionId, string> = {
  hero: "بنر الواجهة الرئيسي",
  trustBadges: "مربعات المزايا",
  categories: "تسوق حسب التصنيف",
  bestSellers: "الأكثر مبيعاً",
  customBanner: "بنر العروض العام",
  competitiveBanner: "سكشن الميزة التنافسية",
};

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

function createCustomSection(): CustomHomeSection {
  return {
    id: `custom-${Date.now()}`,
    enabled: true,
    title: "سكشن جديد",
    subtitle: "",
    text: "اكتب النص الذي يظهر فوق الصورة",
    backgroundColor: "#101010",
    textColor: "#ffffff",
    linkUrl: "/shop",
    desktopImage: "",
    tabletImage: "",
    mobileImage: "",
    categorySlug: "",
    productLimit: 4,
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
            مقاسات مقترحة عامة: ديسكتوب 1920x600 أو 1600x500، تابلت 1200x600، موبايل 750x900.
            مقاسات العنوان المقترحة: ديسكتوب 48-64px، تابلت 36-48px، موبايل 28-36px.
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
              {settings.homeSectionsOrder.map((sectionId, index) => (
                <div key={sectionId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3">
                  <span className="text-sm font-bold text-zinc-800">{sectionLabels[sectionId]}</span>
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
              ))}
            </div>
          </div>
          <div className="grid gap-4 rounded-xl border border-black/10 bg-white p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">السكشنات المخصصة</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  يمكنك إنشاء سكشن بصورة خلفية ونص ورابط ومنتجات تصنيف مثل القلايات أو الخلاطات.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSettings({
                    ...settings,
                    customSections: [...settings.customSections, createCustomSection()],
                  })
                }
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
                        onClick={() =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.filter((item) => item.id !== section.id),
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

                  <MultilineTextField
                    label="النص فوق الصورة"
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
                    <Field label="لون الخلفية">
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
                    <Field label="لون النص">
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
                    <Field label="رابط الضغط على الصورة">
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
                    <Field label="slug التصنيف">
                      <input
                        value={section.categorySlug}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            customSections: settings.customSections.map((item) =>
                              item.id === section.id ? { ...item, categorySlug: event.target.value } : item,
                            ),
                          })
                        }
                        placeholder="مثال: air-fryers"
                        className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-4">
                    <Field label="عدد المنتجات">
                      <input
                        type="number"
                        min={1}
                        max={12}
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
                    label="صورة السكشن - ديسكتوب"
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
                    label="صورة السكشن - تابلت"
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
                    label="صورة السكشن - موبايل"
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
            <ImageUploadField
              label="صورة Hero - ديسكتوب"
              value={settings.hero.desktopImage}
              purpose="hero-desktop"
              recommendation="1920x720px"
              aspectRatio="8:3"
              onUploaded={(url) =>
                setSettings({ ...settings, hero: { ...settings.hero, desktopImage: url, enabled: true } })
              }
            />
            <ImageUploadField
              label="صورة Hero - تابلت"
              value={settings.hero.tabletImage}
              purpose="hero-tablet"
              recommendation="1200x600px"
              aspectRatio="2:1"
              onUploaded={(url) =>
                setSettings({ ...settings, hero: { ...settings.hero, tabletImage: url, enabled: true } })
              }
            />
            <ImageUploadField
              label="صورة Hero - موبايل"
              value={settings.hero.mobileImage}
              purpose="hero-mobile"
              recommendation="750x900px"
              aspectRatio="5:6"
              onUploaded={(url) =>
                setSettings({ ...settings, hero: { ...settings.hero, mobileImage: url, enabled: true } })
              }
            />
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
            <MultilineTextField
              label="نص بنر أعلى الهيدر"
              value={settings.topBanner.text}
              onChange={(value) => setSettings({ ...settings, topBanner: { ...settings.topBanner, text: value } })}
            />
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

