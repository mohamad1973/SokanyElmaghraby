"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { heroSlideHasMedia } from "@/lib/hero-slide-utils";
import type { HeroSlide } from "@/lib/theme-settings";

type HeroCarouselProps = {
  slides: HeroSlide[];
  alt: string;
  intervalSeconds: number;
  sizes?: string;
};

function HeroSlideMedia({
  slide,
  alt,
  priority = false,
  sizes = "100vw",
}: {
  slide: HeroSlide;
  alt: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (slide.mediaType === "video") {
    const videoSrc = slide.desktopVideo || slide.tabletVideo || slide.mobileVideo;
    const fallbackImage = slide.desktopImage || slide.tabletImage || slide.mobileImage;

    if (videoSrc) {
      return (
        <video
          src={videoSrc}
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover object-center"
        />
      );
    }

    if (fallbackImage) {
      return (
        <Image
          src={fallbackImage}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          className="object-cover object-center"
          unoptimized
        />
      );
    }

    return null;
  }

  const imageSrc = slide.desktopImage || slide.tabletImage || slide.mobileImage;

  if (!imageSrc) {
    return null;
  }

  return (
    <Image
      src={imageSrc}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className="object-cover object-center"
      unoptimized
    />
  );
}

export function HeroCarousel({ slides, alt, intervalSeconds, sizes = "100vw" }: HeroCarouselProps) {
  const activeSlides = slides.filter(heroSlideHasMedia);
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
        const content = (
          <HeroSlideMedia slide={slide} alt={alt} priority={slideIndex === 0} sizes={sizes} />
        );

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

export { heroSlideHasMedia } from "@/lib/hero-slide-utils";
