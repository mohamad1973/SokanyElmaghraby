import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useState } from "react";

import type { ThemeSettings } from "@/lib/theme-settings";
import type { MenuNode } from "@/lib/types";

import { HeaderProductSearch } from "./header-product-search";
import { VisualEditableText } from "./visual-editable-text";

type TopBannerIconName = "quality" | "shipping" | "price" | "secure" | "support" | "warranty";
type TopBannerStyle = CSSProperties & {
  "--top-banner-duration": string;
  "--top-banner-gap-width": string;
};

const topBannerIconOrder: TopBannerIconName[] = ["quality", "shipping", "price", "secure", "support", "warranty"];
const topBannerContentLoops = [0, 1, 2, 3];

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

function HeaderIcon({ icon }: { icon: "account" | "cart" | "favorite" | "compare" }) {
  const className = "h-5 w-5";

  if (icon === "cart") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M6 7h15l-2 8H8L6 7ZM6 7 5 4H2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      </svg>
    );
  }

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

function MobileMenuTree({
  items,
  depth = 0,
  onNavigate,
}: {
  items: MenuNode[];
  depth?: number;
  onNavigate: () => void;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <ul className={depth ? "mt-2 grid gap-2 border-r border-black/10 pr-3" : "grid gap-2"}>
      {items.map((item) => (
        <li key={item.id} className={depth ? "" : "rounded-[5px] border border-black/10 bg-white p-2"}>
          <Link
            href={item.href}
            onClick={onNavigate}
            className={[
              "block rounded-[5px] px-4 py-3 font-bold transition hover:bg-brand-gold hover:text-black",
              depth ? "bg-zinc-50 text-sm text-zinc-700" : "bg-white text-sm text-zinc-950",
            ].join(" ")}
          >
            {item.title}
          </Link>
          <MobileMenuTree items={item.children} depth={depth + 1} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}

function MobileMenuButton({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black text-white lg:hidden"
      aria-label={isOpen ? "إغلاق المنيو" : "فتح المنيو"}
      aria-expanded={isOpen}
    >
      <span className="grid gap-1">
        <span className="block h-0.5 w-5 rounded-full bg-current" />
        <span className="block h-0.5 w-5 rounded-full bg-current" />
        <span className="block h-0.5 w-5 rounded-full bg-current" />
      </span>
    </button>
  );
}

export function Header({ settings, menu }: { settings: ThemeSettings; menu: MenuNode[] }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const headerMenu = menu.length ? menu : settings.navigation.map((item, index) => ({
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
  const topBannerPhrases = settings.topBanner.text
    .split(/•|\n/)
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  const topBannerItems = (topBannerPhrases.length ? topBannerPhrases : [settings.topBanner.text]).map((label, index) => ({
    icon: topBannerIconOrder[index % topBannerIconOrder.length],
    label,
  }));
  const topBannerSegments = [0, 1];
  const headerActions = [
    { href: "/account", label: "الحساب", icon: "account" as const },
    { href: "/cart", label: "السلة", icon: "cart" as const },
    { href: "/offers", label: "المفضلة", icon: "favorite" as const },
    { href: "/shop", label: "مقارنة المنتجات", icon: "compare" as const },
  ];
  const logoStyle = {
    "--logo-mobile-width": `${settings.brand.logoMobileWidth}px`,
    "--logo-mobile-height": `${settings.brand.logoMobileHeight}px`,
    "--logo-desktop-width": `${settings.brand.logoDesktopWidth}px`,
    "--logo-desktop-height": `${settings.brand.logoDesktopHeight}px`,
  } as CSSProperties;
  const topBannerStyle = {
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
          ) : (
            <span className="top-banner-marquee" aria-label={topBannerItems.map((item) => item.label).join(" - ")}>
              <span className="top-banner-marquee-track">
                {topBannerSegments.map((segment) => (
                  <span key={segment} className="top-banner-marquee-content" aria-hidden={segment > 0}>
                    {topBannerContentLoops.map((loopIndex) =>
                      topBannerItems.map((item, itemIndex) => (
                        <span key={`${segment}-${loopIndex}-${itemIndex}`} className="top-banner-marquee-item">
                          <TopBannerIcon icon={item.icon} />
                          <span>{item.label}</span>
                        </span>
                      )),
                    )}
                    {settings.topBanner.gapMode === "spaced" ? (
                      <span className="top-banner-marquee-gap" aria-hidden="true" />
                    ) : null}
                  </span>
                ))}
              </span>
            </span>
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
        </div>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:hidden">
        <div className="flex items-center gap-2">
          <HeaderProductSearch className="relative block min-w-0 flex-1" />
          <MobileMenuButton
            isOpen={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((currentValue) => !currentValue)}
          />
        </div>

        {isMobileMenuOpen ? (
          <div className="absolute right-4 top-full z-[80] w-2/3 max-w-sm sm:right-6" dir="rtl">
          <div className="max-h-[70vh] overflow-y-auto rounded-[5px] border border-black/10 bg-white p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-black/10 pb-3">
              <p className="text-base font-bold text-zinc-950">
                <VisualEditableText textKey="header.mobileMenu.title">القائمة</VisualEditableText>
              </p>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-lg font-bold"
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>
            <MobileMenuTree items={headerMenu} onNavigate={() => setIsMobileMenuOpen(false)} />
          </div>
          </div>
        ) : null}
      </div>

      <DesktopMenu menu={headerMenu} />
    </header>
  );
}

