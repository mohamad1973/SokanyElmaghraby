"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getMaxOrderQuantity } from "@/lib/cart";
import type { Product } from "@/lib/types";

import { useCart } from "./cart-provider";
import { VisualEditableText } from "./visual-editable-text";

type ProductQuantityAddToCartProps = {
  product: Product;
  variant?: "page" | "card";
};

function toCartPayload(product: Product) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    image: product.image,
    stockStatus: product.stockStatus,
    stockQuantity: product.stockQuantity,
  };
}

export function ProductQuantityAddToCart({
  product,
  variant = "page",
}: ProductQuantityAddToCartProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const maxQty = getMaxOrderQuantity(product);
  const outOfStock = maxQty < 1;
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);

  const safeQty = outOfStock ? 0 : Math.min(Math.max(1, qty), maxQty);

  function setClampedQty(next: number) {
    if (outOfStock) {
      return;
    }

    setQty(Math.min(Math.max(1, next), maxQty));
    setFeedback(null);
  }

  function handleAddToCart() {
    if (outOfStock) {
      return;
    }

    const result = addItem({ ...toCartPayload(product), qty: safeQty });
    setFeedback(result.message || "تمت الإضافة إلى السلة");
  }

  function handleBuyNow() {
    if (outOfStock) {
      return;
    }

    addItem({ ...toCartPayload(product), qty: safeQty });
    router.push("/checkout");
  }

  if (variant === "card") {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center justify-center gap-2" dir="ltr">
          <button
            type="button"
            aria-label="تقليل الكمية"
            disabled={outOfStock || safeQty <= 1}
            onClick={() => setClampedQty(safeQty - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white text-sm font-bold text-zinc-950 disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-8 text-center text-sm font-bold text-zinc-950">{safeQty || 0}</span>
          <button
            type="button"
            aria-label="زيادة الكمية"
            disabled={outOfStock || safeQty >= maxQty}
            onClick={() => setClampedQty(safeQty + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white text-sm font-bold text-zinc-950 disabled:opacity-40"
          >
            +
          </button>
        </div>
        <button
          type="button"
          disabled={outOfStock}
          onClick={handleAddToCart}
          className="rounded-full bg-black px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-gold hover:text-black disabled:opacity-40"
        >
          أضف للسلة
        </button>
        {feedback ? <p className="text-center text-[11px] font-medium text-zinc-600">{feedback}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="inline-flex items-center gap-3 rounded-full border border-black/10 bg-white px-2 py-2" dir="ltr">
          <button
            type="button"
            aria-label="تقليل الكمية"
            disabled={outOfStock || safeQty <= 1}
            onClick={() => setClampedQty(safeQty - 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-lg font-bold text-zinc-950 transition hover:bg-brand-gold disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-10 text-center text-xl font-bold text-zinc-950">{safeQty || 0}</span>
          <button
            type="button"
            aria-label="زيادة الكمية"
            disabled={outOfStock || safeQty >= maxQty}
            onClick={() => setClampedQty(safeQty + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-lg font-bold text-zinc-950 transition hover:bg-brand-gold disabled:opacity-40"
          >
            +
          </button>
        </div>
        {!outOfStock ? (
          <p className="text-sm font-medium text-zinc-500">
            {typeof product.stockQuantity === "number"
              ? `المتوفر: ${maxQty} قطعة`
              : `يمكنك طلب حتى ${maxQty} قطعة`}
          </p>
        ) : (
          <p className="text-sm font-bold text-red-600">غير متوفر حالياً</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={outOfStock}
          onClick={handleBuyNow}
          className="rounded-full bg-brand-gold px-8 py-4 text-center text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:opacity-40"
        >
          <VisualEditableText textKey="product.buyNow">شراء الآن</VisualEditableText>
        </button>
        <button
          type="button"
          disabled={outOfStock}
          onClick={handleAddToCart}
          className="rounded-full border border-black/10 bg-white px-8 py-4 text-center text-sm font-bold text-zinc-950 transition hover:border-brand-gold hover:text-brand-gold disabled:opacity-40"
        >
          <VisualEditableText textKey="product.addToCart">أضف للسلة</VisualEditableText>
        </button>
      </div>

      {feedback ? <p className="text-sm font-medium text-zinc-600">{feedback}</p> : null}
    </div>
  );
}
