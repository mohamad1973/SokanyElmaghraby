import type { Metadata } from "next";
import Link from "next/link";

import { VisualEditableText } from "@/components/visual-editable-text";

export const metadata: Metadata = {
  title: "سلة المشتريات",
};

export default function CartPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[2.5rem] bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-bold text-brand-gold">
            <VisualEditableText textKey="cart.eyebrow">السلة</VisualEditableText>
          </p>
          <h1 className="mt-3 text-4xl font-bold text-zinc-950">
            <VisualEditableText textKey="cart.title">سلة المشتريات</VisualEditableText>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl leading-8 text-zinc-600">
            <VisualEditableText textKey="cart.description">
              هذه نسخة MVP أولية. في المرحلة التالية سيتم تفعيل cart state وربطه مع
              WooCommerce لإنشاء الطلبات وحساب الشحن والكوبونات.
            </VisualEditableText>
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/shop"
              className="rounded-full bg-black px-7 py-3 text-sm font-bold text-white transition hover:bg-brand-gold hover:text-black"
            >
              <VisualEditableText textKey="cart.continueShopping">متابعة التسوق</VisualEditableText>
            </Link>
            <Link
              href="/checkout"
              className="rounded-full bg-brand-gold px-7 py-3 text-sm font-bold text-black transition hover:bg-brand-gold-dark"
            >
              <VisualEditableText textKey="cart.checkout">إتمام الطلب</VisualEditableText>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

