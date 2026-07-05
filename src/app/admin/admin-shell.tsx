"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { OrderNotificationBar } from "./order-notification-bar";

const navItems = [
  { href: "/admin", label: "لوحة التحكم" },
  { href: "/admin/theme", label: "المظهر" },
  { href: "/admin/header", label: "الهيدر" },
  { href: "/admin/footer", label: "الفوتر" },
  { href: "/admin/social-media", label: "السوشيال ميديا" },
  { href: "/admin/banners", label: "البنرات" },
  { href: "/admin/navigation", label: "المنيو" },
  { href: "/admin/products", label: "المنتجات" },
  { href: "/admin/categories", label: "التصنيفات" },
  { href: "/admin/orders", label: "الطلبات" },
  { href: "/admin/dispatch/setup", label: "إعداد الشحن" },
  { href: "/admin/dispatch/board", label: "التوزيع" },
  { href: "/admin/dispatch/drivers", label: "المندوبين" },
  { href: "/admin/dispatch/zones", label: "الأحياء" },
  { href: "/admin/dispatch/reports", label: "تقارير التوصيل" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return children;
  }

  return (
    <div className="min-h-screen bg-[#f0f0f1] text-[#1d2327]" dir="ltr">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 bg-[#1d2327] text-white lg:block">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-lg font-bold">إدارة سوكاني</p>
          <p className="text-xs text-zinc-400">لوحة تحكم الواجهة</p>
        </div>
        <nav className="space-y-1 p-3 text-sm">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 transition ${
                  isActive ? "bg-brand-gold text-black" : "text-zinc-200 hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-56">
        <OrderNotificationBar />
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-black/10 bg-white px-4 shadow-sm">
          <div>
            <p className="text-sm font-bold">تحكم واجهة سوكاني</p>
            <p className="text-xs text-zinc-500">لوحة تحكم للمتجر والواجهة الأمامية</p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="rounded-md border border-black/10 px-3 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
          >
            Logout
          </button>
        </header>

        <main className="p-4 lg:p-8" dir="rtl">
          {children}
        </main>
      </div>
    </div>
  );
}

