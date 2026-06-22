import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import type { ThemeSettings } from "@/lib/theme-settings";
import type { MenuNode } from "@/lib/types";

import { VisualEditableText } from "./visual-editable-text";

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

function MobileMenu({ menu, settings }: { menu: MenuNode[]; settings: ThemeSettings }) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <div className="border-t border-black/5 px-4 py-3 lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto text-sm font-bold text-zinc-700">
        {settings.header.mobileShowSearch ? (
          <Link href="/shop" className="rounded-full bg-brand-cream px-4 py-2 text-zinc-950">
            <VisualEditableText textKey="mobile.search">بحث</VisualEditableText>
          </Link>
        ) : null}
        {settings.header.mobileShowCart ? (
          <Link href="/cart" className="rounded-full bg-white px-4 py-2 text-zinc-950">
            <VisualEditableText textKey="mobile.cart">السلة</VisualEditableText>
          </Link>
        ) : null}
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
            <VisualEditableText textKey="topBanner.text">{settings.topBanner.text}</VisualEditableText>
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

        <nav className="hidden items-center gap-7 text-sm font-bold text-zinc-700 lg:flex">
          {settings.navigation.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-brand-gold">
              <VisualEditableText textKey={`navigation.${item.href}`}>{item.label}</VisualEditableText>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {settings.header.showCart ? (
            <Link
              href="/cart"
              className="hidden rounded-full border border-black/10 px-4 py-2 text-sm font-bold text-zinc-900 transition hover:border-brand-gold hover:text-brand-gold sm:inline-flex"
            >
              <VisualEditableText textKey="header.cart">السلة</VisualEditableText>
            </Link>
          ) : null}
          <Link
            href={settings.header.ctaUrl}
            className="rounded-full bg-brand-gold px-5 py-2.5 text-sm font-bold text-black shadow-sm transition hover:bg-brand-gold-dark"
          >
            <VisualEditableText textKey="header.ctaText">{settings.header.ctaText}</VisualEditableText>
          </Link>
        </div>
      </div>

      <DesktopMenu menu={headerMenu} />
      <MobileMenu menu={headerMenu} settings={settings} />
    </header>
  );
}

