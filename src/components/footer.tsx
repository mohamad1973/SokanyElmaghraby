import Link from "next/link";

import type { ThemeSettings } from "@/lib/theme-settings";

import { VisualEditableText } from "./visual-editable-text";

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
              <p className="text-xl font-bold">
                <VisualEditableText textKey="footer.logoText">{settings.brand.logoText} Egypt</VisualEditableText>
              </p>
              <p className="text-sm text-zinc-400">
                <VisualEditableText textKey="footer.tagline">{settings.brand.tagline}</VisualEditableText>
              </p>
            </div>
          </div>
          <p className="max-w-md text-sm leading-7 text-zinc-300">
            <VisualEditableText textKey="footer.description">{settings.footer.description}</VisualEditableText>
          </p>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-brand-gold">
            <VisualEditableText textKey="footer.shopTitle">المتجر</VisualEditableText>
          </h3>
          <div className="space-y-3 text-sm text-zinc-300">
            <Link href="/shop" className="block hover:text-white">
              <VisualEditableText textKey="footer.shopAll">كل المنتجات</VisualEditableText>
            </Link>
            <Link href="/offers" className="block hover:text-white">
              <VisualEditableText textKey="footer.offers">العروض</VisualEditableText>
            </Link>
            <Link href="/cart" className="block hover:text-white">
              <VisualEditableText textKey="footer.cart">سلة المشتريات</VisualEditableText>
            </Link>
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-brand-gold">
            <VisualEditableText textKey="footer.customerServiceTitle">خدمة العملاء</VisualEditableText>
          </h3>
          <div className="space-y-3 text-sm text-zinc-300">
            <Link href="/warranty" className="block hover:text-white">
              <VisualEditableText textKey="footer.warranty">الضمان والصيانة</VisualEditableText>
            </Link>
            <Link href="/contact" className="block hover:text-white">
              <VisualEditableText textKey="footer.contact">تواصل معنا</VisualEditableText>
            </Link>
            <Link href="/return-policy" className="block hover:text-white">
              <VisualEditableText textKey="footer.returnPolicy">سياسة الاسترجاع</VisualEditableText>
            </Link>
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-brand-gold">
            <VisualEditableText textKey="footer.paymentTitle">طرق الدفع</VisualEditableText>
          </h3>
          <div className="space-y-3 text-sm text-zinc-300">
            <p><VisualEditableText textKey="footer.paymentFawry">فوري للدفع الإلكتروني</VisualEditableText></p>
            <p><VisualEditableText textKey="footer.paymentCod">كاش عند الاستلام</VisualEditableText></p>
            <p><VisualEditableText textKey="footer.paymentConfirm">تأكيد الطلب قبل الشحن</VisualEditableText></p>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()}{" "}
        <VisualEditableText textKey="footer.copyright">{settings.footer.copyright}</VisualEditableText>
      </div>
    </footer>
  );
}

