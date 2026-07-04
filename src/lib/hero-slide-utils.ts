import type { HeroSlide } from "@/lib/theme-settings";

export function heroSlideHasMedia(slide: HeroSlide) {
  if (slide.mediaType === "video") {
    return Boolean(slide.desktopVideo || slide.tabletVideo || slide.mobileVideo);
  }

  return Boolean(slide.desktopImage || slide.tabletImage || slide.mobileImage);
}
