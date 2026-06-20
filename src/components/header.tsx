import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import type { ThemeSettings } from "@/lib/theme-settings";
import type { MenuNode } from "@/lib/types";

function categoryIconName(title: string) {
  if (title.includes("مطبخ")) {
    return "kitchen";
  }

  if (title.includes("منزل")) {
    return "home";
  }

  if (title.includes("العناية") || title.includes("شخص")) {
    return "care";
  }

  if (title.includes("غيار") || title.includes("قطع")) {
    return "parts";
  }

  return "category";
}

function CategoryIcon({ title }: { title: string }) {
  const icon = categoryIconName(title);

  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-black">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2">
        {icon === "kitchen" ? (
          <>
            <path d="M7 3v18" />
            <path d="M4 7h6" />
            <path d="M17 3v18" />
            <path d="M14 7h6v4h-6z" />
          </>
        ) : null}
        {icon === "home" ? (
          <>
            <path d="M3 11 12 4l9 7" />
            <path d="M5 10v10h14V10" />
            <path d="M9 20v-6h6v6" />
          </>
        ) : null}
        {icon === "care" ? (
          <>
            <path d="M8 4h8v7a4 4 0 0 1-8 0z" />
            <path d="M12 15v6" />
            <path d="M8 21h8" />
          </>
        ) : null}
        {icon === "parts" ? (
          <>
            <path d="M14 7a4 4 0 0 0-5 5l-5 5 3 3 5-5a4 4 0 0 0 5-5z" />
            <path d="m14 7 3 3" />
          </>
        ) : null}
        {icon === "category" ? (
          <>
            <path d="M4 4h7v7H4z" />
            <path d="M13 4h7v7h-7z" />
            <path d="M4 13h7v7H4z" />
            <path d="M13 13h7v7h-7z" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

function DesktopSubCategories({ items }: { items: MenuNode[] }) {
  return (
    <div className="grid min-w-[280px] gap-2 p-3">
      {items.map((child) => (
        <div key={child.id} className="rounded-xl border border-black/5 bg-white">
          <Link
            href={child.href}
            className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-bold text-zinc-900 transition hover:bg-brand-gold"
          >
            <span>{child.title}</span>
            {child.children.length ? <span className="text-zinc-400">‹</span> : null}
          </Link>
          {child.children.length ? (
            <div className="grid gap-1 border-t border-black/5 bg-zinc-50 px-3 py-2">
              {child.children.map((grandChild) => (
                <Link
                  key={grandChild.id}
                  href={grandChild.href}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-white hover:text-black"
                >
                  {grandChild.title}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DesktopMenu({ menu }: { menu: MenuNode[] }) {
  if (!menu.length) {
    return null;
  }

  return (
    <nav className="hidden border-t border-black/10 bg-brand-gold lg:block">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-1 px-4 sm:px-6 lg:px-8">
        {menu.map((item) => (
          <div key={item.id} className="group relative">
            <Link
              href={item.href}
              className="flex min-h-14 items-center gap-3 px-5 py-3 text-base font-bold text-black transition hover:bg-black hover:text-white"
            >
              <CategoryIcon title={item.title} />
              {item.title}
              {item.children.length ? <span className="text-xs text-black/45 group-hover:text-white/70">⌄</span> : null}
            </Link>

            {item.children.length ? (
              <div className="invisible absolute right-0 top-full z-50 translate-y-2 rounded-b-2xl border border-black/10 bg-white text-black opacity-0 shadow-2xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                <DesktopSubCategories items={item.children} />
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

  if (!menu.length) {
    return null;
  }

  return (
    <div className="border-t border-black/5 bg-brand-gold px-4 py-3 lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto text-sm font-bold text-black">
        {settings.header.mobileShowSearch ? (
          <Link href="/shop" className="whitespace-nowrap rounded-full bg-black px-4 py-2 text-white">
            بحث
          </Link>
        ) : null}
        {settings.header.mobileShowCart ? (
          <Link href="/cart" className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-zinc-950">
            السلة
          </Link>
        ) : null}
        {menu.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenId(openId === item.id ? null : item.id)}
            className="flex whitespace-nowrap rounded-full bg-white/85 px-4 py-2 text-black shadow-sm"
          >
            {item.title}
          </button>
        ))}
      </div>

      {openId ? (
        <div className="mt-3 rounded-2xl bg-white p-3 text-black shadow-lg">
          {menu
            .find((item) => item.id === openId)
            ?.children.map((child) => (
              <div key={child.id} className="border-b border-black/5 last:border-b-0">
                <Link
                  href={child.href}
                  className="block rounded-xl px-4 py-3 text-sm font-bold hover:bg-brand-gold"
                >
                  {child.title}
                </Link>
                {child.children.length ? (
                  <div className="grid gap-1 pb-3 pr-4">
                    {child.children.map((grandChild) => (
                      <Link
                        key={grandChild.id}
                        href={grandChild.href}
                        className="rounded-lg px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-black"
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
  );
}

export function Header({ settings, menu }: { settings: ThemeSettings; menu: MenuNode[] }) {
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
            settings.topBanner.text
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
              {settings.brand.logoText}
            </span>
            <span className="block text-xs font-semibold text-zinc-500">{settings.brand.tagline}</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {settings.header.showCart ? (
            <Link
              href="/cart"
              className="hidden rounded-full border border-black/10 px-4 py-2 text-sm font-bold text-zinc-900 transition hover:border-brand-gold hover:text-brand-gold sm:inline-flex"
            >
              السلة
            </Link>
          ) : null}
          <Link
            href={settings.header.ctaUrl}
            className="rounded-full bg-brand-gold px-5 py-2.5 text-sm font-bold text-black shadow-sm transition hover:bg-brand-gold-dark"
          >
            {settings.header.ctaText}
          </Link>
        </div>
      </div>

      <DesktopMenu menu={menu} />
      <MobileMenu menu={menu} settings={settings} />
    </header>
  );
}

