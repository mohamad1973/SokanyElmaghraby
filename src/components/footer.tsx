import Link from "next/link";

import type { ThemeSettings } from "@/lib/theme-settings";

export function Footer({ settings }: { settings: ThemeSettings }) {
  return (
    <footer className="border-t border-white/10 bg-zinc-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gold text-sm font-bold text-black">
              SK
            </span>
            <div>
              <p className="text-xl font-bold">{settings.brand.logoText} Egypt</p>
              <p className="text-sm text-zinc-400">{settings.brand.tagline}</p>
            </div>
          </div>
          <p className="max-w-md text-sm leading-7 text-zinc-300">
            {settings.footer.description}
          </p>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-brand-gold">المتجر</h3>
          <div className="space-y-3 text-sm text-zinc-300">
            <Link href="/shop" className="block hover:text-white">
              كل المنتجات
            </Link>
            <Link href="/offers" className="block hover:text-white">
              العروض
            </Link>
            <Link href="/cart" className="block hover:text-white">
              سلة المشتريات
            </Link>
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-brand-gold">خدمة العملاء</h3>
          <div className="space-y-3 text-sm text-zinc-300">
            <Link href="/warranty" className="block hover:text-white">
              الضمان والصيانة
            </Link>
            <Link href="/contact" className="block hover:text-white">
              تواصل معنا
            </Link>
            <Link href="/return-policy" className="block hover:text-white">
              سياسة الاسترجاع
            </Link>
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-brand-gold">طرق الدفع</h3>
          <div className="space-y-3 text-sm text-zinc-300">
            <p>فوري للدفع الإلكتروني</p>
            <p>كاش عند الاستلام</p>
            <p>تأكيد الطلب قبل الشحن</p>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} {settings.footer.copyright}
      </div>
    </footer>
  );
}

