"use client";

import Link from "next/link";
import { useEffect } from "react";

import type { MenuNode } from "@/lib/types";

import { HeaderProductSearch } from "./header-product-search";
import { MobileMenuTree } from "./mobile-menu-tree";
import { useMobileNav } from "./mobile-nav-context";
import { VisualEditableText } from "./visual-editable-text";

const accountLinks = [
  { href: "/account", label: "الحساب" },
  { href: "/account", label: "طلباتي" },
  { href: "/contact", label: "تتبع طلب" },
  { href: "/account", label: "المفضلة" },
];

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MobileSideDrawer({ menu }: { menu: MenuNode[] }) {
  const { isDrawerOpen, closeDrawer } = useMobileNav();

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen]);

  if (!isDrawerOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] lg:hidden" dir="rtl">
      <button
        type="button"
        aria-label="إغلاق القائمة"
        onClick={closeDrawer}
        className="absolute inset-0 bg-black/40"
      />

      <aside className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/10 bg-white px-4 py-4">
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="إغلاق"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xl font-bold text-zinc-700"
          >
            ×
          </button>
          <Link
            href="/account"
            onClick={closeDrawer}
            aria-label="الحساب"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-zinc-950"
          >
            <AccountIcon />
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <HeaderProductSearch className="relative block w-full" />

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              href="/offers"
              onClick={closeDrawer}
              className="rounded-2xl bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-700 transition hover:bg-rose-100"
            >
              العروض
            </Link>
            <Link
              href="/shop"
              onClick={closeDrawer}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-center text-sm font-bold text-zinc-950 transition hover:border-brand-gold"
            >
              كل المنتجات
            </Link>
          </div>

          <Link
            href="/shop"
            onClick={closeDrawer}
            className="mt-2 block rounded-2xl border border-black/10 bg-white px-4 py-3 text-center text-sm font-bold text-zinc-950 transition hover:border-brand-gold"
          >
            تصفح كل التصنيفات
          </Link>

          <p className="mb-3 mt-6 text-sm font-bold text-zinc-500">
            <VisualEditableText textKey="header.mobileMenu.categories">التصنيفات</VisualEditableText>
          </p>
          <MobileMenuTree items={menu} onNavigate={closeDrawer} />

          <p className="mb-3 mt-6 text-sm font-bold text-zinc-500">حسابي وطلباتي</p>
          <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
            {accountLinks.map((link, index) => (
              <Link
                key={`${link.label}-${index}`}
                href={link.href}
                onClick={closeDrawer}
                className={[
                  "block px-4 py-3 text-sm font-bold text-zinc-800 transition hover:bg-brand-gold hover:text-black",
                  index < accountLinks.length - 1 ? "border-b border-black/5" : "",
                ].join(" ")}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
