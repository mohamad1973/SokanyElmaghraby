"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useProductLists } from "./product-lists-provider";

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path
        d="M12 20s-7.5-4.4-9.2-9.1C1.5 7.4 3.7 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.5 2.9 4.2 6.4C19.5 15.6 12 20 12 20Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeaderWishlistMenu() {
  const { wishlist, removeFromWishlist } = useProductLists();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="المفضلة"
        title="المفضلة"
        onClick={() => setIsOpen((current) => !current)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-zinc-950 transition hover:border-brand-gold hover:bg-brand-gold sm:h-10 sm:w-10"
      >
        <HeartIcon className="h-5 w-5" />
        {wishlist.length ? (
          <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold text-white">
            {wishlist.length}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-[80] mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-3xl border border-black/10 bg-white p-3 shadow-2xl" dir="rtl">
          <p className="px-2 py-1 text-sm font-bold text-zinc-950">المفضلة</p>

          {!wishlist.length ? (
            <p className="px-2 py-4 text-sm font-semibold text-zinc-500">لا توجد منتجات في المفضلة بعد.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {wishlist.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-brand-cream"
                >
                  <Link
                    href={`/product/${entry.slug}`}
                    onClick={() => setIsOpen(false)}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                      <Image src={entry.image} alt={entry.name} fill sizes="48px" className="object-contain p-1" />
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 block text-sm font-bold text-zinc-950">{entry.name}</span>
                      <span className="mt-1 block text-xs font-bold text-zinc-500">{entry.price} ج.م</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label={`إزالة ${entry.name} من المفضلة`}
                    onClick={() => removeFromWishlist(entry.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-700 transition hover:bg-zinc-200"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
