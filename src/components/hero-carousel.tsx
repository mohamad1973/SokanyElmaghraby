"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { HeroSlide } from "@/lib/theme-settings";

type HeroCarouselProps = {
  slides: HeroSlide[];
  alt: string;
  intervalSeconds: number;
};

function slideHasImage(slide: HeroSlide) {
  return Boolean(slide.desktopImage || slide.tabletImage || slide.mobileImage);
}

function HeroSlideImages({
  slide,
  alt,
  priority = false,
}: {
  slide: HeroSlide;
  alt: string;
  priority?: boolean;
}) {
  return (
    <>
      {slide.desktopImage ? (
        <Image
          src={slide.desktopImage}
          alt={alt}
          fill
          priority={priority}
          sizes="100vw"
          className="hidden object-cover lg:block"
          unoptimized
        />
      ) : null}
      {slide.tabletImage ? (
        <Image
          src={slide.tabletImage}
          alt={alt}
          fill
          priority={priority}
          sizes="100vw"
          className={`hidden object-cover sm:block ${slide.desktopImage ? "lg:hidden" : ""}`}
          unoptimized
        />
      ) : null}
      {!slide.tabletImage && slide.desktopImage ? (
        <Image
          src={slide.desktopImage}
          alt={alt}
          fill
          priority={priority}
          sizes="100vw"
          className="hidden object-cover sm:block lg:hidden"
          unoptimized
        />
      ) : null}
      {slide.mobileImage || slide.tabletImage || slide.desktopImage ? (
        <Image
          src={slide.mobileImage || slide.tabletImage || slide.desktopImage}
          alt={alt}
          fill
          priority={priority}
          sizes="100vw"
          className={slide.tabletImage || slide.desktopImage ? "object-cover sm:hidden" : "object-cover"}
          unoptimized
        />
      ) : null}
    </>
  );
}

export function HeroCarousel({ slides, alt, intervalSeconds }: HeroCarouselProps) {
  const activeSlides = slides.filter(slideHasImage);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [activeSlides.length]);

  useEffect(() => {
    if (activeSlides.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % activeSlides.length);
    }, intervalSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [activeSlides.length, intervalSeconds]);

  if (activeSlides.length === 0) {
    return null;
  }

  function goTo(nextIndex: number) {
    setIndex((nextIndex + activeSlides.length) % activeSlides.length);
  }

  return (
    <div className="absolute inset-0">
      {activeSlides.map((slide, slideIndex) => {
        const isActive = slideIndex === index;
        const content = <HeroSlideImages slide={slide} alt={alt} priority={slideIndex === 0} />;

        return (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-700 ${isActive ? "opacity-100" : "pointer-events-none opacity-0"}`}
            aria-hidden={!isActive}
          >
            {slide.linkUrl ? (
              <Link href={slide.linkUrl} className="relative block h-full w-full">
                {content}
              </Link>
            ) : (
              <div className="relative h-full w-full">{content}</div>
            )}
          </div>
        );
      })}

      {activeSlides.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="الشريحة السابقة"
            onClick={() => goTo(index - 1)}
            className="absolute left-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/35 text-xl font-bold text-white backdrop-blur-sm transition hover:bg-black/55 sm:flex"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="الشريحة التالية"
            onClick={() => goTo(index + 1)}
            className="absolute right-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/35 text-xl font-bold text-white backdrop-blur-sm transition hover:bg-black/55 sm:flex"
          >
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {activeSlides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`الانتقال إلى الشريحة ${slideIndex + 1}`}
                onClick={() => goTo(slideIndex)}
                className={`h-2.5 rounded-full transition ${slideIndex === index ? "w-8 bg-brand-gold" : "w-2.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
