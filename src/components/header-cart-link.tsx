"use client";

import Link from "next/link";

import { useCart } from "./cart-provider";

function CartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M6 7h15l-2 8H8L6 7ZM6 7 5 4H2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </svg>
  );
}

export function HeaderCartLink() {
  const { itemCount, toastMessage } = useCart();

  return (
    <div className="relative">
      <Link
        href="/cart"
        aria-label="السلة"
        title="السلة"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-zinc-950 transition hover:border-brand-gold hover:bg-brand-gold sm:h-10 sm:w-10"
      >
        <CartIcon className="h-5 w-5" />
        {itemCount > 0 ? (
          <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold text-white">
            {itemCount > 99 ? "99+" : itemCount}
          </span>
        ) : null}
      </Link>

      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-0 top-full z-[90] mt-2 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-black px-3 py-2 text-xs font-bold leading-5 text-brand-gold shadow-lg sm:text-sm"
          dir="rtl"
        >
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
