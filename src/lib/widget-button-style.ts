import type { CSSProperties } from "react";

import type { WidgetButtonStyle } from "@/lib/theme-settings";

export function widgetButtonInlineStyle(style: WidgetButtonStyle): CSSProperties {
  const borderRadius = style.shape === "circle" ? 9999 : style.borderRadius;
  const border = style.borderEnabled
    ? `${style.borderWidth}px solid ${style.borderColor}`
    : "none";

  return {
    width: style.size,
    height: style.size,
    borderRadius,
    border,
    backgroundColor: style.backgroundColor,
    color: style.iconColor,
    ["--widget-btn-bg" as string]: style.backgroundColor,
    ["--widget-btn-bg-hover" as string]: style.hoverBackgroundColor,
    ["--widget-btn-icon" as string]: style.iconColor,
  };
}

export function widgetButtonIconSize(style: WidgetButtonStyle): number {
  return Math.round(style.size * 0.45);
}
