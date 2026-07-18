import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { ThemeSettings } from "@/lib/theme-settings";
import type { MenuNode } from "@/lib/types";

import { bannerSpacingStyle } from "@/lib/banner-spacing";

import { HeaderCartLink } from "./header-cart-link";
import { HeaderCompareLink } from "./header-compare-link";
import { HeaderProductSearch } from "./header-product-search";
import { HeaderWishlistMenu } from "./header-wishlist-menu";
import { TopBannerMarquee, type TopBannerIconName } from "./top-banner-marquee";
import { VisualEditableText } from "./visual-editable-text";

type TopBannerStyle = CSSProperties & {
  "--top-banner-duration": string;
  "--top-banner-gap-width": string;
};

const topBannerIconOrder: TopBannerIconName[] = ["quality", "shipping", "price", "secure", "support", "warranty"];

function TopBannerIcon({ icon }: { icon: TopBannerIconName }) {
  const className = "top-banner-icon";

  if (icon === "shipping") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M3 7h11v9H3V7ZM14 10h3.6l2.4 3v3h-6v-6Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </svg>
    );
  }

  if (icon === "price") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M4 12V6h6l9.5 9.5-6 6L4 12Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 9h.01" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "secure") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M6 11V8a6 6 0 0 1 12 0v3" strokeLinecap="round" />
        <path d="M5 11h14v10H5V11Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 15v2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "support") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M4 12a8 8 0 1 1 16 0v4a3 3 0 0 1-3 3h-2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 12v3a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 1ZM20 12v3a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 1Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "warranty") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M12 3 19 6v5c0 4.5-2.8 8.5-7 10-4.2-1.5-7-5.5-7-10V6l7-3Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.3 6.7 19l1-5.8-4.2-4.1 5.9-.9L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeaderIcon({ icon }: { icon: "account" | "favorite" | "compare" }) {
  const className = "h-5 w-5";

  if (icon === "favorite") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M12 20s-7.5-4.4-9.2-9.1C1.5 7.4 3.7 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.5 2.9 4.2 6.4C19.5 15.6 12 20 12 20Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "compare") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DesktopMenu({ menu }: { menu: MenuNode[] }) {
  return (
    <nav className="hidden border-t border-black/10 bg-brand-gold lg:block">
      <div className="mx-auto flex max-w-7xl items-center justify-start px-4 sm:px-6 lg:px-8">
        {menu.map((item) => (
          <div key={item.id} className="group relative">
            <Link
              href={item.href}
              className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-black transition hover:bg-black hover:text-white"
            >
              {item.title}
              {item.children.length ? <span className="text-xs">‹</span> : null}
            </Link>

            {item.children.length ? (
              <div className="invisible absolute right-0 top-full z-50 min-w-64 translate-y-2 rounded-b-xl bg-zinc-950 p-2 text-white opacity-0 shadow-2xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                {item.children.map((child) => (
                  <div key={child.id} className="group/child relative">
                    <Link
                      href={child.href}
                      className="flex items-center justify-between rounded-lg px-4 py-3 text-sm font-bold transition hover:bg-brand-gold hover:text-black"
                    >
                      <span>{child.title}</span>
                      {child.children.length ? <span>‹</span> : null}
                    </Link>

                    {child.children.length ? (
                      <div className="invisible absolute right-full top-0 min-w-60 translate-x-2 rounded-xl bg-zinc-900 p-2 opacity-0 shadow-xl transition group-hover/child:visible group-hover/child:translate-x-0 group-hover/child:opacity-100">
                        {child.children.map((grandChild) => (
                          <Link
                            key={grandChild.id}
                            href={grandChild.href}
                            className="block rounded-lg px-4 py-3 text-sm transition hover:bg-brand-gold hover:text-black"
                          >
                            {grandChild.title}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </nav>
  );
}

export function buildHeaderMenu(settings: ThemeSettings, menu: MenuNode[]): MenuNode[] {
  return menu.length
    ? menu
    : settings.navigation.map((item, index) => ({
        id: index + 1,
        title: item.label,
        url: item.href,
        href: item.href,
        type: "custom",
        object: "custom",
        objectId: 0,
        slug: "",
        children: [],
      }));
}

export function Header({ settings, menu }: { settings: ThemeSettings; menu: MenuNode[] }) {
  const headerMenu = buildHeaderMenu(settings, menu);
  const topBannerPhrases = settings.topBanner.text
    .split(/•|\n/)
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  const topBannerItems = (topBannerPhrases.length ? topBannerPhrases : [settings.topBanner.text]).map((label, index) => ({
    icon: topBannerIconOrder[index % topBannerIconOrder.length],
    label,
  }));
  const headerActions = [{ href: "/account", label: "الحساب", icon: "account" as const }];
  const logoStyle = {
    "--logo-mobile-width": `${settings.brand.logoMobileWidth}px`,
    "--logo-mobile-height": `${settings.brand.logoMobileHeight}px`,
    "--logo-desktop-width": `${settings.brand.logoDesktopWidth}px`,
    "--logo-desktop-height": `${settings.brand.logoDesktopHeight}px`,
  } as CSSProperties;
  const topBannerStyle = {
    ...bannerSpacingStyle(settings.topBanner.spacing),
    "--top-banner-duration": `${settings.topBanner.speedSeconds}s`,
    "--top-banner-gap-width": settings.topBanner.gapMode === "spaced" ? `${settings.topBanner.gapWidth}px` : "0px",
  } as TopBannerStyle;

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white/95 backdrop-blur-xl">
      {settings.topBanner.enabled ? (
        <Link
          href={settings.topBanner.url}
          className="custom-topbar"
          style={topBannerStyle}
        >
          {settings.topBanner.desktopImage || settings.topBanner.mobileImage ? (
            <>
              {settings.topBanner.desktopImage ? (
                <span className="relative hidden h-12 md:block">
                  <Image
                    src={settings.topBanner.desktopImage}
                    alt={settings.topBanner.text}
                    fill
                    sizes="100vw"
                    className="object-cover"
                    unoptimized
                  />
                </span>
              ) : null}
              {settings.topBanner.mobileImage ? (
                <span className="relative block h-14 md:hidden">
                  <Image
                    src={settings.topBanner.mobileImage}
                    alt={settings.topBanner.text}
                    fill
                    sizes="100vw"
                    className="object-cover"
                    unoptimized
                  />
                </span>
              ) : null}
            </>
          ) : settings.topBanner.textAnimation === "static" ? (
            <span className="top-banner-static" aria-label={topBannerItems.map((item) => item.label).join(" - ")}>
              {topBannerItems.map((item, itemIndex) => (
                <span key={`static-${itemIndex}-${item.label}`} className="top-banner-marquee-item">
                  <TopBannerIcon icon={item.icon} />
                  <span>{item.label}</span>
                </span>
              ))}
            </span>
          ) : (
            <TopBannerMarquee items={topBannerItems} durationSeconds={settings.topBanner.speedSeconds} />
          )}
        </Link>
      ) : null}

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-6 lg:px-8 lg:py-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3" aria-label="الرئيسية">
          {settings.brand.logoUrl ? (
            <span
              className="relative block h-[var(--logo-mobile-height)] w-[var(--logo-mobile-width)] sm:h-[var(--logo-desktop-height)] sm:w-[var(--logo-desktop-width)]"
              style={logoStyle}
            >
              <Image
                src={settings.brand.logoUrl}
                alt={settings.brand.logoText}
                fill
                sizes={`(min-width: 640px) ${settings.brand.logoDesktopWidth}px, ${settings.brand.logoMobileWidth}px`}
                className="object-contain object-right"
                unoptimized
              />
            </span>
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gold text-sm font-bold text-black">
              {settings.brand.logoText.slice(0, 2)}
            </span>
          )}
          <span className="block min-w-0 leading-tight">
            <span className="block truncate text-sm font-bold tracking-tight text-zinc-950 sm:text-lg lg:text-xl">
              <VisualEditableText textKey="header.logoText">{settings.brand.logoText}</VisualEditableText>
            </span>
            <span className="block truncate text-[10px] font-semibold text-zinc-500 sm:text-xs">
              <VisualEditableText textKey="header.tagline">{settings.brand.tagline}</VisualEditableText>
            </span>
          </span>
          </Link>
        </div>

        <HeaderProductSearch />
        <a
          href="tel:17355"
          className="hidden h-10 shrink-0 items-center justify-center rounded-full border border-brand-gold bg-brand-gold px-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark lg:inline-flex"
          dir="ltr"
          aria-label="الاتصال بالهوت لاين 17355"
        >
          17355
        </a>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {headerActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              aria-label={action.label}
              title={action.label}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-zinc-950 transition hover:border-brand-gold hover:bg-brand-gold sm:h-10 sm:w-10"
            >
              <HeaderIcon icon={action.icon} />
            </Link>
          ))}
          <HeaderCartLink />
          <HeaderWishlistMenu />
          <HeaderCompareLink />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:hidden">
        <div className="flex items-center gap-2">
          <HeaderProductSearch className="relative block min-w-0 flex-1" />
          <a
            href="tel:17355"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-brand-gold bg-brand-gold px-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark"
            dir="ltr"
            aria-label="الاتصال بالهوت لاين 17355"
          >
            17355
          </a>
        </div>
      </div>

      <DesktopMenu menu={headerMenu} />
    </header>
  );
}
