import type { CSSProperties } from "react";

import type { ResponsiveWidgetPlacement, WidgetPlacement } from "@/lib/theme-settings";

export function clampPlacement(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mergeWidgetPlacement(value: unknown, defaults: WidgetPlacement): WidgetPlacement {
  const placement = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    bottom: clampPlacement(
      typeof placement.bottom === "number" ? placement.bottom : defaults.bottom,
      0,
      300,
    ),
    inset: clampPlacement(
      typeof placement.inset === "number" ? placement.inset : defaults.inset,
      0,
      300,
    ),
  };
}

export function mergeResponsiveWidgetPlacement(
  value: unknown,
  defaults: ResponsiveWidgetPlacement,
): ResponsiveWidgetPlacement {
  const placement = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    desktop: mergeWidgetPlacement(placement.desktop, defaults.desktop),
    mobile: mergeWidgetPlacement(placement.mobile, defaults.mobile),
  };
}

export function getWidgetPlacementStyle(placement: WidgetPlacement, side: "right" | "left"): CSSProperties {
  return side === "right"
    ? { bottom: placement.bottom, right: placement.inset }
    : { bottom: placement.bottom, left: placement.inset };
}
