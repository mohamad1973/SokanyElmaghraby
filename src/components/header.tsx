import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import type { ThemeSettings } from "@/lib/theme-settings";
import type { MenuNode } from "@/lib/types";

import { HeaderProductSearch } from "./header-product-search";
import { VisualEditableText } from "./visual-editable-text";

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

function MobileMenu({ menu }: { menu: MenuNode[] }) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <div className="border-t border-black/5 px-4 py-3 lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto text-sm font-bold text-zinc-700">
        {menu.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenId(openId === item.id ? null : item.id)}
            className="whitespace-nowrap rounded-full bg-brand-gold px-4 py-2 text-black"
          >
            {item.title}
          </button>
        ))}
      </div>

      {openId ? (
        <div className="mt-3 rounded-2xl bg-zinc-950 p-3 text-white">
          {menu
            .find((item) => item.id === openId)
            ?.children.map((child) => (
              <Link
                key={child.id}
                href={child.href}
                className="block rounded-xl px-4 py-3 text-sm font-bold hover:bg-brand-gold hover:text-black"
              >
                {child.title}
              </Link>
            ))}
        </div>
      ) : null}
    </div>
  );
}

export function Header({ settings, menu }: { settings: ThemeSettings; menu: MenuNode[] }) {
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
  const topBannerItems = topBannerPhrases.length ? topBannerPhrases : [settings.topBanner.text];
  const headerActions = [
    { href: "/admin/login", label: "الحساب", icon: "account" as const },
    { href: "/cart", label: "السلة", icon: "cart" as const },
    { href: "/offers", label: "المفضلة", icon: "favorite" as const },
    { href: "/shop", label: "مقارنة المنتجات", icon: "compare" as const },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white/95 backdrop-blur-xl">
      {settings.topBanner.enabled ? (
        <Link
          href={settings.topBanner.url}
          className="relative block overflow-hidden bg-zinc-950 px-4 py-2 text-center text-xs font-bold text-brand-gold"
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
            <span className="top-banner-marquee" aria-label={settings.topBanner.text}>
              <span className="top-banner-marquee-track">
                {[0, 1].map((item) => (
                  <span key={item} className="top-banner-marquee-item">
                    {topBannerItems.map((phrase, index) => (
                      <span key={`${phrase}-${index}`} className="top-banner-marquee-phrase">
                        <VisualEditableText textKey={`topBanner.text.${index}`}>{phrase}</VisualEditableText>
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            </span>
          )}
        </Link>
      ) : null}

      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Sokany Egypt home">
          {settings.brand.logoUrl ? (
            <span className="relative block h-12 w-36">
              <Image
                src={settings.brand.logoUrl}
                alt={settings.brand.logoText}
                fill
                sizes="144px"
                className="object-contain object-right"
                unoptimized
              />
            </span>
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gold text-sm font-bold text-black">
              {settings.brand.logoText.slice(0, 2)}
            </span>
          )}
          <span className="leading-tight">
            <span className="block text-xl font-bold tracking-tight text-zinc-950">
              <VisualEditableText textKey="header.logoText">{settings.brand.logoText}</VisualEditableText>
            </span>
            <span className="block text-xs font-semibold text-zinc-500">
              <VisualEditableText textKey="header.tagline">{settings.brand.tagline}</VisualEditableText>
            </span>
          </span>
        </Link>

        <HeaderProductSearch />

        <div className="flex items-center gap-2">
          {headerActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              aria-label={action.label}
              title={action.label}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-zinc-950 transition hover:border-brand-gold hover:bg-brand-gold"
            >
              <HeaderIcon icon={action.icon} />
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:hidden">
        <HeaderProductSearch className="relative block w-full" />
      </div>

      <DesktopMenu menu={headerMenu} />
      <MobileMenu menu={headerMenu} />
    </header>
  );
}

