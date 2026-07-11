"use client";

import Image from "next/image";
import Link from "next/link";

import { useProductLists } from "./product-lists-provider";

export function CompareFloatingBar() {
  const { compareList, removeFromCompare, clearCompare } = useProductLists();

  if (!compareList.length) {
    return null;
  }

  const canCompare = compareList.length >= 2;

  return (
    <div
      className="fixed bottom-32 left-4 right-4 z-40 mx-auto max-w-3xl rounded-[2rem] border border-black/10 bg-white p-4 shadow-2xl sm:left-6 sm:right-6 lg:bottom-24"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-zinc-950">قائمة المقارنة</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {compareList.map((entry, index) => (
            <div key={entry.id} className="relative">
              <span className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white">
                {index + 1}
              </span>
              <span className="relative block h-12 w-12 overflow-hidden rounded-xl border border-black/10 bg-zinc-50">
                <Image src={entry.image} alt={entry.name} fill sizes="48px" className="object-contain p-1" />
              </span>
              <button
                type="button"
                aria-label={`إزالة ${entry.name} من المقارنة`}
                onClick={() => removeFromCompare(entry.id)}
                className="absolute -left-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={clearCompare}
            className="rounded-full border border-black/10 px-4 py-2 text-xs font-bold text-zinc-700 transition hover:border-brand-gold"
          >
            مسح الكل
          </button>
          <Link
            href="/compare"
            className={`rounded-full px-5 py-2 text-xs font-bold transition ${
              canCompare
                ? "bg-black text-white hover:bg-brand-gold hover:text-black"
                : "cursor-not-allowed bg-zinc-200 text-zinc-500"
            }`}
            aria-disabled={!canCompare}
            onClick={(event) => {
              if (!canCompare) {
                event.preventDefault();
              }
            }}
          >
            قارن الآن
          </Link>
        </div>
      </div>
    </div>
  );
}
