import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { SiteChrome } from "@/components/site-chrome";
import { routing } from "@/i18n/routing";
import { getHeaderMenu } from "@/lib/menu";
import { getThemeSettings } from "@/lib/theme-settings";

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const [messages, settings, menu] = await Promise.all([
    getMessages(),
    getThemeSettings(),
    getHeaderMenu(),
  ]);

  return (
    <NextIntlClientProvider messages={messages}>
      <SiteChrome settings={settings} menu={menu}>
        {children}
      </SiteChrome>
    </NextIntlClientProvider>
  );
}
