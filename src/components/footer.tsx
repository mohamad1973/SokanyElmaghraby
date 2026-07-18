import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { ThemeSettings } from "@/lib/theme-settings";

import { VisualEditableText } from "./visual-editable-text";

export function Footer({ settings }: { settings: ThemeSettings }) {
  const footerLogoUrl = settings.footer.logoUrl || settings.brand.logoUrl;
  const logoDesktopWidth = settings.footer.logoUrl
    ? settings.footer.logoDesktopWidth
    : settings.brand.logoDesktopWidth;
  const logoDesktopHeight = settings.footer.logoUrl
    ? settings.footer.logoDesktopHeight
    : settings.brand.logoDesktopHeight;
  const logoMobileWidth = settings.footer.logoUrl
    ? settings.footer.logoMobileWidth
    : settings.brand.logoMobileWidth;
  const logoMobileHeight = settings.footer.logoUrl
    ? settings.footer.logoMobileHeight
    : settings.brand.logoMobileHeight;

  const logoStyle = {
    "--logo-mobile-width": `${logoMobileWidth}px`,
    "--logo-mobile-height": `${logoMobileHeight}px`,
    "--logo-desktop-width": `${logoDesktopWidth}px`,
    "--logo-desktop-height": `${logoDesktopHeight}px`,
  } as CSSProperties;

  return (
    <footer className="border-t border-white/10 bg-zinc-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <div className="mb-4 flex items-center gap-3">
            {footerLogoUrl ? (
              <span
                className="relative block h-[var(--logo-mobile-height)] w-[var(--logo-mobile-width)] sm:h-[var(--logo-desktop-height)] sm:w-[var(--logo-desktop-width)]"
                style={logoStyle}
              >
                <Image
                  src={footerLogoUrl}
                  alt={settings.brand.logoText}
                  fill
                  sizes={`(min-width: 640px) ${logoDesktopWidth}px, ${logoMobileWidth}px`}
                  className="object-contain object-right"
                  unoptimized
                />
              </span>
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gold text-sm font-bold text-black">
                {settings.brand.logoText.slice(0, 2)}
              </span>
            )}
            <div>
              <p className="text-xl font-bold">
                <VisualEditableText textKey="footer.logoText">{settings.brand.logoText}</VisualEditableText>
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
