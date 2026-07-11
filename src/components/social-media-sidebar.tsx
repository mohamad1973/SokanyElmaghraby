import type { SocialMediaSettings } from "@/lib/theme-settings";
import { widgetButtonIconSize } from "@/lib/widget-button-style";

import { WidgetActionButton } from "./widget-action-button";

type SocialLink = {
  id: "facebook" | "instagram" | "tiktok";
  href: string;
  label: string;
};

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.5 4H16V1h-2.5C10.98 1 9 2.98 9 5.5V8H6v3h3v8h3v-8h2.7l.3-3H12V5.5c0-.83.67-1.5 1.5-1.5Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 4.5c.7 1.2 1.8 2.1 3.2 2.5V10c-1.3-.1-2.5-.5-3.5-1.1v5.8c0 3-2.4 5.4-5.4 5.4S5.4 17.7 5.4 14.7 7.8 9.3 10.8 9.3c.4 0 .8.1 1.2.2v3.2a2.2 2.2 0 1 0 1.6 2.1V4.5h3.9Z" />
    </svg>
  );
}

const iconById = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
};

export function SocialMediaSidebar({ settings }: { settings: SocialMediaSettings }) {
  const links: SocialLink[] = [
    settings.facebookUrl ? { id: "facebook", href: settings.facebookUrl, label: "Facebook" } : null,
    settings.instagramUrl ? { id: "instagram", href: settings.instagramUrl, label: "Instagram" } : null,
    settings.tiktokUrl ? { id: "tiktok", href: settings.tiktokUrl, label: "TikTok" } : null,
  ].filter((link): link is SocialLink => Boolean(link));

  if (!settings.enabled || links.length === 0) {
    return null;
  }

  const iconSize = widgetButtonIconSize(settings.buttonStyle);
  const sidebarPlacement = settings.desktopSidebarPlacement;

  return (
    <aside
      dir="ltr"
      className="fixed z-40 hidden flex-col gap-2.5 sm:gap-3 lg:flex"
      style={{
        left: sidebarPlacement.inset,
        top: `${sidebarPlacement.topPercent}%`,
        transform: "translateY(-50%)",
      }}
      aria-label="روابط السوشيال ميديا"
    >
      {links.map((link) => {
        const Icon = iconById[link.id];

        return (
          <WidgetActionButton
            key={link.id}
            style={settings.buttonStyle}
            href={link.href}
            ariaLabel={link.label}
          >
            <span
              className="inline-flex [&_svg]:h-full [&_svg]:w-full"
              style={{ width: iconSize, height: iconSize }}
            >
              <Icon />
            </span>
          </WidgetActionButton>
        );
      })}
    </aside>
  );
}
