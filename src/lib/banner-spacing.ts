import type { CSSProperties } from "react";

export type BannerSpacing = {
  spacingTop: number;
  spacingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  gapToContent: number;
};

export const defaultBannerSpacing: BannerSpacing = {
  spacingTop: 0,
  spacingBottom: 0,
  paddingLeft: 0,
  paddingRight: 0,
  gapToContent: 32,
};

export const defaultSideBannerSpacing: BannerSpacing = {
  ...defaultBannerSpacing,
  gapToContent: 24,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mergeBannerSpacing(value: unknown, overrides?: Partial<BannerSpacing>): BannerSpacing {
  const spacing = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const base = { ...defaultBannerSpacing, ...overrides };

  return {
    spacingTop: clamp(typeof spacing.spacingTop === "number" ? spacing.spacingTop : base.spacingTop, 0, 200),
    spacingBottom: clamp(typeof spacing.spacingBottom === "number" ? spacing.spacingBottom : base.spacingBottom, 0, 200),
    paddingLeft: clamp(typeof spacing.paddingLeft === "number" ? spacing.paddingLeft : base.paddingLeft, 0, 200),
    paddingRight: clamp(typeof spacing.paddingRight === "number" ? spacing.paddingRight : base.paddingRight, 0, 200),
    gapToContent: clamp(typeof spacing.gapToContent === "number" ? spacing.gapToContent : base.gapToContent, 0, 120),
  };
}

export function bannerSpacingStyle(
  spacing: BannerSpacing,
  options?: { useGapToContent?: boolean },
): CSSProperties {
  return {
    marginTop: spacing.spacingTop,
    marginBottom: options?.useGapToContent ? spacing.gapToContent : spacing.spacingBottom,
    paddingLeft: spacing.paddingLeft,
    paddingRight: spacing.paddingRight,
  };
}

export function bannerHorizontalPaddingStyle(spacing: Pick<BannerSpacing, "paddingLeft" | "paddingRight">): CSSProperties {
  return {
    paddingLeft: spacing.paddingLeft,
    paddingRight: spacing.paddingRight,
  };
}
