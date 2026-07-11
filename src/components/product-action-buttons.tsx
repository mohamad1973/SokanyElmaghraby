"use client";

import type { MouseEvent } from "react";

import type { ProductListEntry } from "@/lib/product-lists";

import { useProductLists } from "./product-lists-provider";

type ProductActionButtonsProps = {
  entry: ProductListEntry;
  size?: "sm" | "md";
  className?: string;
};

function CompareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 20s-7.5-4.4-9.2-9.1C1.5 7.4 3.7 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.5 2.9 4.2 6.4C19.5 15.6 12 20 12 20Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProductActionButtons({ entry, size = "md", className = "" }: ProductActionButtonsProps) {
  const { isWishlisted, isInCompare, getCompareOrder, toggleWishlist, toggleCompare } = useProductLists();
  const wishlisted = isWishlisted(entry.id);
  const inCompare = isInCompare(entry.id);
  const compareOrder = getCompareOrder(entry.id);

  const buttonSize = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const iconSize = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";

  function handleClick(event: MouseEvent, action: () => void) {
    event.preventDefault();
    event.stopPropagation();
    action();
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`} dir="ltr">
      <button
        type="button"
        aria-label={wishlisted ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
        title={wishlisted ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
        onClick={(event) => handleClick(event, () => toggleWishlist(entry))}
        className={`relative inline-flex ${buttonSize} items-center justify-center rounded-full border border-black/10 bg-white/95 text-zinc-950 shadow-sm transition hover:border-brand-gold hover:bg-brand-gold`}
      >
        <HeartIcon className={iconSize} filled={wishlisted} />
      </button>

      <button
        type="button"
        aria-label={inCompare ? "إزالة من المقارنة" : "إضافة إلى المقارنة"}
        title={inCompare ? "إزالة من المقارنة" : "إضافة إلى المقارنة"}
        onClick={(event) => handleClick(event, () => toggleCompare(entry))}
        className={`relative inline-flex ${buttonSize} items-center justify-center rounded-full border border-black/10 bg-white/95 text-zinc-950 shadow-sm transition hover:border-brand-gold hover:bg-brand-gold ${
          inCompare ? "border-brand-gold bg-brand-gold" : ""
        }`}
      >
        <CompareIcon className={iconSize} />
        {compareOrder ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold text-white">
            {compareOrder}
          </span>
        ) : null}
      </button>
    </div>
  );
}
