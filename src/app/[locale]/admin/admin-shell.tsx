"use client";

import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";

import { OrderNotificationBar } from "./order-notification-bar";

const navItemKeys = [
  { href: "/admin", key: "dashboard" as const },
  { href: "/admin/theme", key: "theme" as const },
  { href: "/admin/header", key: "header" as const },
  { href: "/admin/footer", key: "footer" as const },
  { href: "/admin/social-media", key: "socialMedia" as const },
  { href: "/admin/banners", key: "banners" as const },
  { href: "/admin/reviews", key: "reviews" as const },
  { href: "/admin/navigation", key: "navigation" as const },
  { href: "/admin/products", key: "products" as const },
  { href: "/admin/categories", key: "categories" as const },
  { href: "/admin/orders", key: "orders" as const },
  { href: "/admin/reports", key: "reports" as const },
  { href: "/admin/dispatch/setup", key: "dispatchSetup" as const },
  { href: "/admin/dispatch/board", key: "dispatchBoard" as const },
  { href: "/admin/dispatch/drivers", key: "drivers" as const },
  { href: "/admin/dispatch/zones", key: "zones" as const },
  { href: "/admin/dispatch/reports", key: "dispatchReports" as const },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("admin");
  const dir = locale === "ar" ? "rtl" : "ltr";

  if (pathname === "/admin/login") {
    return children;
  }

  return (
    <div className="min-h-screen bg-[#f0f0f1] text-[#1d2327]" dir="ltr">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 bg-[#1d2327] text-white lg:block">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-lg font-bold">{t("brand")}</p>
          <p className="text-xs text-zinc-400">{t("brandSub")}</p>
        </div>
        <nav className="space-y-1 p-3 text-sm">
          {navItemKeys.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive ? "bg-brand-gold text-black" : "text-zinc-200 hover:bg-white/10"
                }`}
              >
                {t(`nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-56">
        <OrderNotificationBar />
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-black/10 bg-white px-4 shadow-sm">
          <div>
            <p className="text-sm font-bold">{t("headerTitle")}</p>
            <p className="text-xs text-zinc-500">{t("headerSub")}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: locale === "en" ? "/en/admin/login" : "/admin/login" })}
              className="rounded-md border border-black/10 px-3 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
            >
              {t("logout")}
            </button>
          </div>
        </header>

        <main className="p-4 lg:p-8" dir={dir}>
          {children}
        </main>
      </div>
    </div>
  );
}
