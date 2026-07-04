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
    return (
      <>
        {slide.desktopVideo ? (
          <video
            src={slide.desktopVideo}
            autoPlay
            muted
            loop
            playsInline
            className="hidden h-full w-full object-cover lg:block"
          />
        ) : slide.desktopImage ? (
          <Image
            src={slide.desktopImage}
            alt={alt}
            fill
            priority={priority}
            sizes={sizes}
            className="hidden object-cover lg:block"
            unoptimized
          />
        ) : null}
        {slide.tabletVideo ? (
          <video
            src={slide.tabletVideo}
            autoPlay
            muted
            loop
            playsInline
            className={`hidden h-full w-full object-cover sm:block ${slide.desktopVideo || slide.desktopImage ? "lg:hidden" : ""}`}
          />
        ) : slide.tabletImage ? (
          <Image
            src={slide.tabletImage}
            alt={alt}
            fill
            priority={priority}
            sizes={sizes}
            className={`hidden object-cover sm:block ${slide.desktopVideo || slide.desktopImage ? "lg:hidden" : ""}`}
            unoptimized
          />
        ) : null}
        {!slide.tabletVideo && !slide.tabletImage && (slide.desktopVideo || slide.desktopImage) ? (
          slide.desktopVideo ? (
            <video
              src={slide.desktopVideo}
              autoPlay
              muted
              loop
              playsInline
              className="hidden h-full w-full object-cover sm:block lg:hidden"
            />
          ) : (
            <Image
              src={slide.desktopImage}
              alt={alt}
              fill
              priority={priority}
              sizes={sizes}
              className="hidden object-cover sm:block lg:hidden"
              unoptimized
            />
          )
        ) : null}
        {slide.mobileVideo || slide.tabletVideo || slide.desktopVideo || slide.mobileImage || slide.tabletImage || slide.desktopImage ? (
          slide.mobileVideo || (!slide.mobileImage && (slide.tabletVideo || slide.desktopVideo)) ? (
            <video
              src={slide.mobileVideo || slide.tabletVideo || slide.desktopVideo}
              autoPlay
              muted
              loop
              playsInline
              className={
                slide.tabletVideo || slide.tabletImage || slide.desktopVideo || slide.desktopImage
                  ? "h-full w-full object-cover sm:hidden"
                  : "h-full w-full object-cover"
              }
            />
          ) : (
            <Image
              src={slide.mobileImage || slide.tabletImage || slide.desktopImage}
              alt={alt}
              fill
              priority={priority}
              sizes={sizes}
              className={
                slide.tabletImage || slide.desktopImage || slide.tabletVideo || slide.desktopVideo
                  ? "object-cover sm:hidden"
                  : "object-cover"
              }
              unoptimized
            />
          )
        ) : null}
      </>
    );
  }

  return (
    <>
      {slide.desktopImage ? (
        <Image
          src={slide.desktopImage}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
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
          sizes={sizes}
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
          sizes={sizes}
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
          sizes={sizes}
          className={slide.tabletImage || slide.desktopImage ? "object-cover sm:hidden" : "object-cover"}
          unoptimized
        />
      ) : null}
    </>
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
