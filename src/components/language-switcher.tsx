"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

const LOCALE_COOKIE = "NEXT_LOCALE";

function setLocaleCookie(locale: AppLocale) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${maxAge};samesite=lax`;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("language");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(nextLocale: AppLocale) {
    if (nextLocale === locale) {
      return;
    }

    setLocaleCookie(nextLocale);
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 p-0.5 text-xs font-bold ${className}`}
      role="group"
      aria-label={t("label")}
    >
      {routing.locales.map((item) => {
        const active = item === locale;

        return (
          <button
            key={item}
            type="button"
            onClick={() => switchTo(item)}
            className={`rounded-full px-2.5 py-1 transition ${
              active ? "bg-brand-gold text-black" : "text-zinc-600 hover:bg-zinc-100"
            }`}
            aria-pressed={active}
            aria-label={t("switchTo", { language: t(item) })}
          >
            {item === "ar" ? "ع" : "EN"}
          </button>
        );
      })}
    </div>
  );
}
