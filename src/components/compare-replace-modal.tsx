"use client";

import Image from "next/image";

import type { ProductListEntry } from "@/lib/product-lists";

type CompareReplaceModalProps = {
  isOpen: boolean;
  compareList: ProductListEntry[];
  pendingEntry: ProductListEntry | null;
  onClose: () => void;
  onReplace: (replaceId: number) => void;
};

export function CompareReplaceModal({
  isOpen,
  compareList,
  pendingEntry,
  onClose,
  onReplace,
}: CompareReplaceModalProps) {
  if (!isOpen || !pendingEntry) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-zinc-950">استبدال منتج في المقارنة</h2>
        <p className="mt-2 text-sm leading-7 text-zinc-600">
          يمكنك مقارنة 4 منتجات كحد أقصى. اختر المنتج الذي تريد استبداله بـ{" "}
          <span className="font-bold text-zinc-950">{pendingEntry.name}</span>.
        </p>

        <div className="mt-5 grid gap-3">
          {compareList.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onReplace(entry.id)}
              className="flex items-center gap-3 rounded-2xl border border-black/10 bg-zinc-50 p-3 text-right transition hover:border-brand-gold hover:bg-brand-cream"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                {index + 1}
              </span>
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white">
                <Image src={entry.image} alt={entry.name} fill sizes="56px" className="object-contain p-1" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm font-bold text-zinc-950">{entry.name}</span>
                <span className="mt-1 block text-xs font-bold text-zinc-500">{entry.price} ج.م</span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full border border-black/10 px-5 py-3 text-sm font-bold text-zinc-700 transition hover:border-brand-gold"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
