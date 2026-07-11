"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { CategoriesSectionSettings } from "@/lib/theme-settings";
import type { Category } from "@/lib/types";

type CategoryScrollerProps = {
  categories: Category[];
  fullWidth?: boolean;
  settings: CategoriesSectionSettings;
};

export function CategoryScroller({ categories, fullWidth = false, settings }: CategoryScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(categories.length, settings.mobileVisibleCount),
  );
  const safeVisibleCount = Math.max(1, visibleCount);
  const itemBasis = `calc((100% - (${safeVisibleCount} - 1) * 1rem) / ${safeVisibleCount})`;
  const intervalMs = settings.carouselIntervalSeconds * 1000;

  useEffect(() => {
    function updateVisibleCount() {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setVisibleCount(Math.min(categories.length, settings.desktopVisibleCount));
        return;
      }

      if (window.matchMedia("(min-width: 640px)").matches) {
        setVisibleCount(Math.min(categories.length, settings.tabletVisibleCount));
        return;
      }

      setVisibleCount(Math.min(categories.length, settings.mobileVisibleCount));
    }

    updateVisibleCount();
    window.addEventListener("resize", updateVisibleCount);

    return () => window.removeEventListener("resize", updateVisibleCount);
  }, [
    categories.length,
    settings.desktopVisibleCount,
    settings.tabletVisibleCount,
    settings.mobileVisibleCount,
  ]);

  useEffect(() => {
    activeIndexRef.current = 0;
    scrollerRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [visibleCount]);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller || categories.length <= visibleCount) {
      return;
    }

    const interval = window.setInterval(() => {
      activeIndexRef.current =
        activeIndexRef.current >= categories.length - visibleCount ? 0 : activeIndexRef.current + 1;
      const targetItem = scroller.children[activeIndexRef.current] as HTMLElement | undefined;

      if (targetItem) {
        scroller.scrollTo({
          left: targetItem.offsetLeft,
          behavior: "smooth",
        });
      }
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [categories.length, visibleCount, intervalMs]);

  if (!categories.length) {
    return null;
  }

  return (
    <div
      ref={scrollerRef}
      dir="rtl"
      className={`flex w-full snap-x gap-4 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${fullWidth ? "" : "px-4 sm:px-6 lg:px-8"}`}
    >
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/shop?category=${category.slug}`}
          dir="rtl"
          className="group flex shrink-0 snap-start flex-col items-center text-center"
          style={{ flexBasis: itemBasis }}
        >
          <span className="relative block aspect-square w-full overflow-hidden rounded-full border border-black/10 bg-white shadow-sm transition group-hover:-translate-y-1 group-hover:shadow-xl">
            <Image
              src={category.image || "/product-placeholder.svg"}
              alt={category.name}
              fill
              sizes={`(min-width: 1024px) ${Math.ceil(100 / safeVisibleCount)}vw, (min-width: 640px) 17vw, 25vw`}
              className="object-cover transition duration-500 group-hover:scale-105"
              unoptimized
            />
          </span>
          <span className="mt-3 line-clamp-2 min-h-10 text-xs font-bold leading-5 text-zinc-950 lg:text-sm">
            {category.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
