"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import type { Category } from "@/lib/types";

type CategoryScrollerProps = {
  categories: Category[];
  fullWidth?: boolean;
};

const CAROUSEL_INTERVAL_MS = 3000;
const CAROUSEL_TRANSITION_MS = 600;

function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      href={`/shop?category=${category.slug}`}
      dir="rtl"
      data-category-card
      className="category-carousel-item group flex w-[35vw] shrink-0 flex-col items-center text-center sm:w-[22vw] lg:w-48"
    >
      <span className="relative block aspect-square w-full overflow-hidden rounded-full border border-black/10 bg-white shadow-sm transition group-hover:-translate-y-1 group-hover:shadow-xl">
        <Image
          src={category.image || "/product-placeholder.svg"}
          alt={category.name}
          fill
          sizes="(min-width: 1024px) 12rem, (min-width: 640px) 22vw, 35vw"
          className="object-cover transition duration-500 group-hover:scale-105"
          unoptimized
        />
      </span>
      <span className="mt-3 line-clamp-2 min-h-10 text-xs font-bold leading-5 text-zinc-950 lg:text-sm">
        {category.name}
      </span>
    </Link>
  );
}

export function CategoryScroller({ categories, fullWidth = false }: CategoryScrollerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stepWidthRef = useRef(0);
  const positionIndexRef = useRef(0);
  const loopItemsRef = useRef(categories.length);

  useEffect(() => {
    loopItemsRef.current = categories.length;
    positionIndexRef.current = 0;

    const track = trackRef.current;

    if (track) {
      track.style.transition = "none";
      track.style.transform = "translateX(0)";
    }
  }, [categories.length]);

  useEffect(() => {
    function measureStep() {
      const track = trackRef.current;
      const firstCard = track?.querySelector("[data-category-card]") as HTMLElement | null;

      if (!firstCard || !track) {
        return;
      }

      const trackStyles = window.getComputedStyle(track);
      const gap = Number.parseFloat(trackStyles.columnGap || trackStyles.gap || "0") || 0;
      stepWidthRef.current = firstCard.offsetWidth + gap;
    }

    measureStep();
    window.addEventListener("resize", measureStep);

    return () => window.removeEventListener("resize", measureStep);
  }, [categories.length]);

  useEffect(() => {
    if (categories.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      const track = trackRef.current;
      const stepWidth = stepWidthRef.current;
      const loopItems = loopItemsRef.current;

      if (!track || !stepWidth || !loopItems) {
        return;
      }

      positionIndexRef.current += 1;
      const offset = positionIndexRef.current * stepWidth;

      track.style.transition = `transform ${CAROUSEL_TRANSITION_MS}ms ease`;
      track.style.transform = `translateX(${offset}px)`;

      if (positionIndexRef.current >= loopItems) {
        window.setTimeout(() => {
          positionIndexRef.current = 0;
          track.style.transition = "none";
          track.style.transform = "translateX(0)";
        }, CAROUSEL_TRANSITION_MS);
      }
    }, CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [categories.length]);

  if (!categories.length) {
    return null;
  }

  const duplicatedCategories = [...categories, ...categories];

  return (
    <div
      dir="ltr"
      className={`category-carousel-viewport w-full overflow-hidden pb-4 ${fullWidth ? "" : "px-4 sm:px-6 lg:px-8"}`}
    >
      <div ref={trackRef} className="flex w-max gap-4 will-change-transform">
        {duplicatedCategories.map((category, index) => (
          <CategoryCard key={`${category.id}-${index}`} category={category} />
        ))}
      </div>
    </div>
  );
}
