"use client";

import Image from "next/image";
import Link from "next/link";

import { cartLineTotal, formatCartMoney, getMaxOrderQuantity } from "@/lib/cart";

import { useCart } from "./cart-provider";
import { VisualEditableText } from "./visual-editable-text";

export function CartPageContent() {
  const { items, updateQty, removeItem, itemCount } = useCart();
  const subtotal = items.reduce((sum, item) => sum + cartLineTotal(item), 0);

  if (!items.length) {
    return (
      <div className="rounded-[2.5rem] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-brand-gold">
          <VisualEditableText textKey="cart.eyebrow">السلة</VisualEditableText>
        </p>
        <h1 className="mt-3 text-4xl font-bold text-zinc-950">
          <VisualEditableText textKey="cart.title">سلة المشتريات</VisualEditableText>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl leading-8 text-zinc-600">سلتك فارغة حالياً. تصفّح المنتجات وأضف ما يناسبك.</p>
        <Link
          href="/shop"
          className="mt-8 inline-flex rounded-full bg-black px-7 py-3 text-sm font-bold text-white transition hover:bg-brand-gold hover:text-black"
        >
          <VisualEditableText textKey="cart.continueShopping">متابعة التسوق</VisualEditableText>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2.5rem] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-bold text-brand-gold">
          <VisualEditableText textKey="cart.eyebrow">السلة</VisualEditableText>
        </p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-950 sm:text-4xl">
          <VisualEditableText textKey="cart.title">سلة المشتريات</VisualEditableText>
        </h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">{itemCount} قطعة في السلة</p>

        <ul className="mt-8 divide-y divide-black/5">
          {items.map((item) => {
            const maxQty = getMaxOrderQuantity(item);

            return (
              <li key={item.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
                <Link href={`/product/${item.slug}`} className="relative mx-auto h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-zinc-50 sm:mx-0">
                  <Image src={item.image} alt={item.name} fill className="object-contain p-2" sizes="96px" />
                </Link>
                <div className="min-w-0 flex-1 text-center sm:text-start">
                  <Link href={`/product/${item.slug}`} className="text-base font-bold text-zinc-950 hover:text-brand-gold">
                    {item.name}
                  </Link>
                  <p className="mt-1 text-sm font-medium text-zinc-500">{item.price} ج.م</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-end">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-2 py-1" dir="ltr">
                    <button
                      type="button"
                      aria-label="تقليل الكمية"
                      disabled={item.qty <= 1}
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-sm font-bold">{item.qty}</span>
                    <button
                      type="button"
                      aria-label="زيادة الكمية"
                      disabled={item.qty >= maxQty}
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <p className="min-w-20 text-sm font-bold text-zinc-950">{formatCartMoney(cartLineTotal(item))} ج.م</p>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-xs font-bold text-red-600 hover:underline"
                  >
                    حذف
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between text-base font-bold text-zinc-950">
          <span>الإجمالي</span>
          <span>{formatCartMoney(subtotal)} ج.م</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">الشحن والضرائب يُحسبان عند إتمام الطلب.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/shop"
            className="rounded-full border border-black/10 bg-white px-7 py-3 text-center text-sm font-bold text-zinc-950 transition hover:border-brand-gold"
          >
            <VisualEditableText textKey="cart.continueShopping">متابعة التسوق</VisualEditableText>
          </Link>
          <Link
            href="/checkout"
            className="rounded-full bg-brand-gold px-7 py-3 text-center text-sm font-bold text-black transition hover:bg-brand-gold-dark"
          >
            <VisualEditableText textKey="cart.checkout">إتمام الطلب</VisualEditableText>
          </Link>
        </div>
      </div>
    </div>
  );
}
