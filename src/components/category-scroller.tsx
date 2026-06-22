"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import type { Category } from "@/lib/types";

type CategoryScrollerProps = {
  categories: Category[];
};

export function CategoryScroller({ categories }: CategoryScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller || categories.length <= 4) {
      return;
    }

    const interval = window.setInterval(() => {
      const itemWidth = scroller.querySelector("a")?.clientWidth || 0;
      const gap = 16;
      const nextScroll = scroller.scrollLeft + itemWidth + gap;
      const reachedEnd = nextScroll + scroller.clientWidth >= scroller.scrollWidth - 4;

      scroller.scrollTo({
        left: reachedEnd ? 0 : nextScroll,
        behavior: "smooth",
      });
    }, 3000);

    return () => window.clearInterval(interval);
  }, [categories.length]);

  if (!categories.length) {
    return null;
  }

  return (
    <div
      ref={scrollerRef}
      dir="ltr"
      className="flex snap-x gap-4 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/shop?category=${category.slug}`}
          dir="rtl"
          className="group flex shrink-0 basis-1/4 snap-start flex-col items-center text-center lg:basis-[10%]"
        >
          <span className="relative block aspect-square w-full overflow-hidden rounded-full border border-black/10 bg-white shadow-sm transition group-hover:-translate-y-1 group-hover:shadow-xl">
            <Image
              src={category.image || "/product-placeholder.svg"}
              alt={category.name}
              fill
              sizes="(min-width: 1024px) 10vw, 25vw"
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
