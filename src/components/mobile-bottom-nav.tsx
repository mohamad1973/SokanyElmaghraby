"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useMobileNav } from "./mobile-nav-context";

type NavItem = {
  id: string;
  label: string;
  href?: string;
  icon: ReactNode;
};

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 20v-9.5Z"
        className={active ? "fill-current" : ""}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OffersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h.01M15 15h.01M8.5 15.5l7-7" strokeLinecap="round" />
    </svg>
  );
}

function WarrantyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3 19 6v5c0 4.5-2.8 8.5-7 10-4.2-1.5-7-5.5-7-10V6l7-3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path d="M9 5h10M9 12h10M9 19h10M5 5h.01M5 12h.01M5 19h.01" strokeLinecap="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" strokeLinecap="round" />
    </svg>
  );
}

function NavButton({
  item,
  active,
  onClick,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      <span
        className={[
          "flex h-9 w-9 items-center justify-center rounded-2xl transition",
          active ? "bg-brand-gold text-black" : "text-zinc-600",
        ].join(" ")}
      >
        {item.icon}
      </span>
      <span className={["text-[10px] font-bold", active ? "text-zinc-950" : "text-zinc-500"].join(" ")}>
        {item.label}
      </span>
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} onClick={onNavigate} className="flex flex-1 flex-col items-center gap-1 py-2">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className="flex flex-1 flex-col items-center gap-1 py-2">
      {content}
    </button>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { isDrawerOpen, toggleDrawer, closeDrawer } = useMobileNav();

  const items: NavItem[] = [
    { id: "home", label: "الرئيسية", href: "/", icon: <HomeIcon active={pathname === "/"} /> },
    { id: "offers", label: "العروض", href: "/offers", icon: <OffersIcon /> },
    { id: "warranty", label: "الصيانة", href: "/warranty", icon: <WarrantyIcon /> },
    { id: "about", label: "عن سوكاني", href: "/about", icon: <AboutIcon /> },
    { id: "more", label: "المزيد", icon: <MoreIcon /> },
  ];

  function isActive(item: NavItem) {
    if (item.id === "more") {
      return isDrawerOpen;
    }

    if (!item.href) {
      return false;
    }

    if (item.href === "/") {
      return pathname === "/";
    }

    return pathname.startsWith(item.href);
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur lg:hidden"
      dir="rtl"
      aria-label="التنقل السفلي"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {items.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={isActive(item)}
            onClick={item.id === "more" ? toggleDrawer : undefined}
            onNavigate={item.id === "more" ? undefined : closeDrawer}
          />
        ))}
      </div>
    </nav>
  );
}
