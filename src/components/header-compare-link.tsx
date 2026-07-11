"use client";

import Link from "next/link";

import { useProductLists } from "./product-lists-provider";

function CompareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HeaderCompareLink() {
  const { compareList } = useProductLists();

  return (
    <Link
      href="/compare"
      aria-label="مقارنة المنتجات"
      title="مقارنة المنتجات"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-zinc-950 transition hover:border-brand-gold hover:bg-brand-gold sm:h-10 sm:w-10"
    >
      <CompareIcon className="h-5 w-5" />
      {compareList.length ? (
        <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-black" />
      ) : null}
    </Link>
  );
}
