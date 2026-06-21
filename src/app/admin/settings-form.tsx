"use client";

import { FormEvent, useMemo, useState } from "react";

import type { MenuItem, ThemeSettings } from "@/lib/theme-settings";

import { ImageUploadField } from "./image-upload-field";

type SettingsFormProps = {
  settings: ThemeSettings;
  focus: "theme" | "header" | "footer" | "banners" | "navigation";
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");

    const payload = {
      ...settings,
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
    setStatus("تم حفظ الإعدادات بنجاح. افتح الفرونت أو اعمل Refresh لرؤية التغييرات.");
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
        <section className="grid gap-5 rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <ImageUploadField
            label="صورة بنر أعلى الهيدر - ديسكتوب"
            value={settings.topBanner.desktopImage}
            purpose="top-banner-desktop"
            recommendation="1920x120px"
            aspectRatio="16:1"
            onUploaded={(url) =>
              setSettings({ ...settings, topBanner: { ...settings.topBanner, desktopImage: url } })
            }
          />
          <ImageUploadField
            label="صورة بنر أعلى الهيدر - موبايل"
            value={settings.topBanner.mobileImage}
            purpose="top-banner-mobile"
            recommendation="750x160px"
            aspectRatio="4.7:1"
            onUploaded={(url) =>
              setSettings({ ...settings, topBanner: { ...settings.topBanner, mobileImage: url } })
            }
          />
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
          <Field label="نص بنر أعلى الهيدر">
            <input
              value={settings.topBanner.text}
              onChange={(event) =>
                setSettings({ ...settings, topBanner: { ...settings.topBanner, text: event.target.value } })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={settings.hero.enabled}
              onChange={(event) =>
                setSettings({ ...settings, hero: { ...settings.hero, enabled: event.target.checked } })
              }
            />
            إظهار Hero Section في الصفحة الرئيسية
          </label>
          <Field label="عنوان Hero">
            <input
              value={settings.hero.title}
              onChange={(event) =>
                setSettings({ ...settings, hero: { ...settings.hero, title: event.target.value } })
              }
              className="rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <Field label="وصف Hero">
            <textarea
              value={settings.hero.subtitle}
              onChange={(event) =>
                setSettings({ ...settings, hero: { ...settings.hero, subtitle: event.target.value } })
              }
              className="min-h-28 rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </Field>
          <ImageUploadField
            label="صورة Hero - ديسكتوب"
            value={settings.hero.desktopImage}
            purpose="hero-desktop"
            recommendation="1920x720px"
            aspectRatio="8:3"
            onUploaded={(url) =>
              setSettings({ ...settings, hero: { ...settings.hero, desktopImage: url } })
            }
          />
          <ImageUploadField
            label="صورة Hero - تابلت"
            value={settings.hero.tabletImage}
            purpose="hero-tablet"
            recommendation="1200x600px"
            aspectRatio="2:1"
            onUploaded={(url) =>
              setSettings({ ...settings, hero: { ...settings.hero, tabletImage: url } })
            }
          />
          <ImageUploadField
            label="صورة Hero - موبايل"
            value={settings.hero.mobileImage}
            purpose="hero-mobile"
            recommendation="750x900px"
            aspectRatio="5:6"
            onUploaded={(url) =>
              setSettings({ ...settings, hero: { ...settings.hero, mobileImage: url } })
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
                  customBanner: { ...settings.sections.customBanner, desktopImage: url },
                },
              })
            }
          />
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
            إظهار بنر العروض العام في الصفحة الرئيسية
          </label>
          <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={settings.sections.competitiveBanner}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  sections: {
                    ...settings.sections,
                    competitiveBanner: event.target.checked,
                  },
                })
              }
            />
            إظهار سكشن الميزة التنافسية
          </label>
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
                  customBanner: { ...settings.sections.customBanner, mobileImage: url },
                },
              })
            }
          />
          <div className="rounded-xl bg-zinc-50 p-4 text-sm leading-7 text-zinc-600">
            مقاس صور المنتجات المقترح عند رفعها من WooCommerce: 1000x1000px بنسبة 1:1.
          </div>
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

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-xl bg-brand-gold px-6 py-3 text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:opacity-60"
      >
        {isSaving ? "جاري الحفظ..." : "حفظ الإعدادات"}
      </button>
    </form>
  );
}

