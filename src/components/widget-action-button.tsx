import type { ReactNode } from "react";

import { widgetButtonInlineStyle } from "@/lib/widget-button-style";
import type { WidgetButtonStyle } from "@/lib/theme-settings";

type WidgetActionButtonProps = {
  style: WidgetButtonStyle;
  children: ReactNode;
  ariaLabel: string;
  href?: string;
  onClick?: () => void;
};

export function WidgetActionButton({ style, children, ariaLabel, href, onClick }: WidgetActionButtonProps) {
  const className =
    "widget-action-button flex shrink-0 items-center justify-center shadow-lg transition duration-300";

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={className}
        style={widgetButtonInlineStyle(style)}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={className}
      style={widgetButtonInlineStyle(style)}
    >
      {children}
    </button>
  );
}
