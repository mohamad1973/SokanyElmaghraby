import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { HeroCarousel } from "@/components/hero-carousel";
import { VisualEditableText } from "@/components/visual-editable-text";
import type { HeroSideBanner, HeroSlide, ThemeSettings } from "@/lib/theme-settings";

type HeroSectionProps = {
  hero: ThemeSettings["hero"];
  slides: HeroSlide[];
  sectionContainerClass: string;
  paddingStyle: CSSProperties;
};

function HeroSideBannerCard({ banner, alt }: { banner: HeroSideBanner; alt: string }) {
  if (!banner.image) {
    return null;
  }

  const image = (
    <div className="relative h-full w-full bg-zinc-900">
      <Image src={banner.image} alt={alt} fill sizes="(max-width: 1023px) 100vw, 30vw" className="object-cover" unoptimized />
    </div>
  );

  if (banner.linkUrl) {
    return (
      <Link href={banner.linkUrl} className="block h-full w-full">
        {image}
      </Link>
    );
  }

  return image;
}

function HeroTextOverlay({
  hero,
  sectionContainerClass,
  heroMobileStyle,
  heroTextVisibilityClass,
  heroMobileContentJustifyClass,
  heroContentJustifyClass,
  heroMobileContentTextAlignClass,
  heroContentTextAlignClass,
  heroTextClass,
  heroSubtextClass,
  heroMobileButtonAlignClass,
  heroButtonAlignClass,
  shouldRenderHeroText,
}: {
  hero: ThemeSettings["hero"];
  sectionContainerClass: string;
  heroMobileStyle: CSSProperties;
  heroTextVisibilityClass: string;
  heroMobileContentJustifyClass: string;
  heroContentJustifyClass: string;
  heroMobileContentTextAlignClass: string;
  heroContentTextAlignClass: string;
  heroTextClass: string;
  heroSubtextClass: string;
  heroMobileButtonAlignClass: string;
  heroButtonAlignClass: string;
  shouldRenderHeroText: boolean;
}) {
  if (!shouldRenderHeroText) {
    return null;
  }

  return (
    <div
      className={`absolute inset-0 z-20 flex items-center py-10 sm:py-16 ${sectionContainerClass} ${heroMobileContentJustifyClass} ${heroContentJustifyClass}`}
      style={heroMobileStyle}
    >
      <div
        className={`${heroTextVisibilityClass} max-w-3xl flex-col ${heroMobileContentTextAlignClass} ${heroContentTextAlignClass} ${hero.frameEnabled ? "rounded-[2rem] border border-white/20 bg-black/25 p-8 backdrop-blur-sm" : ""}`}
      >
        <p className="mb-5 inline-flex w-fit rounded-full bg-brand-gold px-4 py-2 text-sm font-bold text-black">
          <VisualEditableText textKey="hero.eyebrow">{hero.eyebrow}</VisualEditableText>
        </p>
        <h1
          className={`text-[length:var(--hero-mobile-title-size)] font-bold leading-tight tracking-tight sm:text-6xl ${heroTextClass}`}
        >
          <VisualEditableText textKey="hero.title">{hero.title}</VisualEditableText>
        </h1>
        <p
          className={`mt-6 max-w-2xl text-[length:var(--hero-mobile-subtitle-size)] leading-8 sm:text-lg sm:leading-9 ${heroSubtextClass}`}
        >
          <VisualEditableText textKey="hero.subtitle">{hero.subtitle}</VisualEditableText>
        </p>
        <div
          className={`mt-9 flex w-full flex-col gap-3 sm:flex-row ${heroMobileButtonAlignClass} ${heroButtonAlignClass}`}
        >
          <Link
            href={hero.primaryCtaUrl}
            className="rounded-full bg-brand-gold px-[var(--hero-mobile-button-px)] py-[var(--hero-mobile-button-py)] text-center text-[length:var(--hero-mobile-button-size)] font-bold text-black transition hover:bg-brand-gold-dark sm:px-8 sm:py-4 sm:text-sm"
          >
            <VisualEditableText textKey="hero.primaryCtaText">{hero.primaryCtaText}</VisualEditableText>
          </Link>
          <Link
            href={hero.secondaryCtaUrl}
            className="rounded-full border border-white/30 bg-white/10 px-[var(--hero-mobile-button-px)] py-[var(--hero-mobile-button-py)] text-center text-[length:var(--hero-mobile-button-size)] font-bold text-white transition hover:border-brand-gold hover:text-brand-gold sm:px-8 sm:py-4 sm:text-sm"
          >
            <VisualEditableText textKey="hero.secondaryCtaText">{hero.secondaryCtaText}</VisualEditableText>
          </Link>
        </div>
      </div>
    </div>
  );
}

function HeroEmptyState({
  hero,
  sectionContainerClass,
  heroMobileStyle,
  heroTextVisibilityClass,
  heroMobileContentTextAlignClass,
  heroContentTextAlignClass,
  shouldRenderHeroText,
  paddingStyle,
}: {
  hero: ThemeSettings["hero"];
  sectionContainerClass: string;
  heroMobileStyle: CSSProperties;
  heroTextVisibilityClass: string;
  heroMobileContentTextAlignClass: string;
  heroContentTextAlignClass: string;
  shouldRenderHeroText: boolean;
  paddingStyle: CSSProperties;
}) {
  return (
    <section className="relative overflow-hidden bg-white" style={paddingStyle}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(218,255,0,0.34),_transparent_34%),linear-gradient(135deg,_rgba(0,0,0,0.04),_transparent_45%)]" />
      <div className={`relative py-20 lg:py-28 ${sectionContainerClass}`} style={heroMobileStyle}>
        {shouldRenderHeroText ? (
          <div
            className={`${heroTextVisibilityClass} flex-col ${heroMobileContentTextAlignClass} ${heroContentTextAlignClass}`}
          >
            <p className="mb-5 inline-flex w-fit rounded-full border border-brand-gold/40 bg-brand-cream px-4 py-2 text-sm font-medium text-zinc-950">
              <VisualEditableText textKey="hero.eyebrow">{hero.eyebrow}</VisualEditableText>
            </p>
            <h1 className="max-w-4xl text-[length:var(--hero-mobile-title-size)] font-bold leading-tight tracking-tight text-zinc-950 sm:text-6xl">
              <VisualEditableText textKey="hero.title">{hero.title}</VisualEditableText>
            </h1>
            <p className="mt-6 max-w-2xl text-[length:var(--hero-mobile-subtitle-size)] leading-8 text-zinc-600 sm:text-lg sm:leading-9">
              <VisualEditableText textKey="hero.subtitle">{hero.subtitle}</VisualEditableText>
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function HeroSection({ hero, slides, sectionContainerClass, paddingStyle }: HeroSectionProps) {
  const heroTextClass = hero.textTone === "dark" ? "text-zinc-950" : "text-white";
  const heroSubtextClass = hero.textTone === "dark" ? "text-zinc-700" : "text-white/85";
  const heroContentJustifyClass = {
    right: "sm:justify-end",
    center: "sm:justify-center",
    left: "sm:justify-start",
  }[hero.contentAlign];
  const heroMobileContentJustifyClass = {
    right: "justify-end",
    center: "justify-center",
    left: "justify-start",
  }[hero.mobileContentAlign];
  const heroContentTextAlignClass = {
    right: "sm:text-right sm:items-end",
    center: "sm:text-center sm:items-center",
    left: "sm:text-left sm:items-start",
  }[hero.contentAlign];
  const heroMobileContentTextAlignClass = {
    right: "text-right items-end",
    center: "text-center items-center",
    left: "text-left items-start",
  }[hero.mobileContentAlign];
  const heroButtonAlignClass = {
    right: "sm:justify-end",
    center: "sm:justify-center",
    left: "sm:justify-start",
  }[hero.contentAlign];
  const heroMobileButtonAlignClass = {
    right: "justify-end",
    center: "justify-center",
    left: "justify-start",
  }[hero.mobileContentAlign];
  const shouldRenderHeroText = hero.showTextOnMobile || hero.showTextOnDesktop;
  const heroTextVisibilityClass = hero.showTextOnMobile
    ? hero.showTextOnDesktop
      ? "flex"
      : "flex sm:hidden"
    : "hidden sm:flex";
  const heroMobileStyle = {
    "--hero-mobile-title-size": `${hero.mobileTitleFontSize}px`,
    "--hero-mobile-subtitle-size": `${hero.mobileSubtitleFontSize}px`,
    "--hero-mobile-button-size": `${hero.mobileButtonFontSize}px`,
    "--hero-mobile-button-px": `${hero.mobileButtonPaddingX}px`,
    "--hero-mobile-button-py": `${hero.mobileButtonPaddingY}px`,
  } as CSSProperties;

  const hasSlides = slides.length > 0;
  const sideBanners = hero.sideBanners.filter((banner) => banner.image);
  const useSplitLayout = hero.layoutMode === "split" && sideBanners.length > 0;

  if (!hasSlides && sideBanners.length === 0) {
    return (
      <HeroEmptyState
        hero={hero}
        sectionContainerClass={sectionContainerClass}
        heroMobileStyle={heroMobileStyle}
        heroTextVisibilityClass={heroTextVisibilityClass}
        heroMobileContentTextAlignClass={heroMobileContentTextAlignClass}
        heroContentTextAlignClass={heroContentTextAlignClass}
        shouldRenderHeroText={shouldRenderHeroText}
        paddingStyle={paddingStyle}
      />
    );
  }

  const textOverlayProps = {
    hero,
    sectionContainerClass,
    heroMobileStyle,
    heroTextVisibilityClass,
    heroMobileContentJustifyClass,
    heroContentJustifyClass,
    heroMobileContentTextAlignClass,
    heroContentTextAlignClass,
    heroTextClass,
    heroSubtextClass,
    heroMobileButtonAlignClass,
    heroButtonAlignClass,
    shouldRenderHeroText,
  };

  if (!useSplitLayout) {
    return (
      <section className="relative overflow-hidden bg-zinc-950" style={paddingStyle}>
        <div className="hero-banner-frame relative w-full">
          {hasSlides ? (
            <HeroCarousel slides={slides} alt={hero.title} intervalSeconds={hero.carouselIntervalSeconds} />
          ) : null}
          {hero.overlayEnabled ? <div className="absolute inset-0 z-10 bg-black/35" /> : null}
          <HeroTextOverlay {...textOverlayProps} />
        </div>
      </section>
    );
  }

  return (
    <section className="hero-split-section relative overflow-hidden bg-white" style={paddingStyle}>
      <div className="hero-split-layout" dir="ltr">
        <div
          className={`hero-split-main hero-banner-radius relative bg-zinc-900 ${
            hasSlides ? "hero-banner-frame-split-main" : "hero-banner-frame"
          }`}
        >
          {hasSlides ? (
            <HeroCarousel
              slides={slides}
              alt={hero.title}
              intervalSeconds={hero.carouselIntervalSeconds}
              sizes="(max-width: 1023px) 100vw, 70vw"
              hideNavArrows
            />
          ) : null}
        </div>

        <div className="hero-split-side-col">
          {sideBanners.map((banner, index) => (
            <div
              key={banner.id}
              className="hero-split-side hero-banner-frame-split-side hero-banner-radius bg-zinc-900"
            >
              <HeroSideBannerCard banner={banner} alt={`${hero.title} - بنر ${index + 1}`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
