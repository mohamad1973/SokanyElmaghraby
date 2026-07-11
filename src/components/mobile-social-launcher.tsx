"use client";

import { useState } from "react";

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

function AtIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M16 12a4 4 0 1 1-4-4" strokeLinecap="round" />
      <path d="M16 8v4a3 3 0 0 0 3 3" strokeLinecap="round" />
    </svg>
  );
}

const iconById = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
};

export function MobileSocialLauncher({ settings }: { settings: SocialMediaSettings }) {
  const [isOpen, setIsOpen] = useState(false);

  const links: SocialLink[] = [
    settings.facebookUrl ? { id: "facebook", href: settings.facebookUrl, label: "Facebook" } : null,
    settings.instagramUrl ? { id: "instagram", href: settings.instagramUrl, label: "Instagram" } : null,
    settings.tiktokUrl ? { id: "tiktok", href: settings.tiktokUrl, label: "TikTok" } : null,
  ].filter((link): link is SocialLink => Boolean(link));

  if (!settings.enabled || links.length === 0) {
    return null;
  }

  const socialIconSize = widgetButtonIconSize(settings.buttonStyle);
  const launcherIconSize = widgetButtonIconSize(settings.mobileLauncherStyle);

  return (
    <div dir="ltr" className="fixed bottom-20 left-4 z-40 flex flex-col-reverse items-center gap-2.5 lg:hidden">
      <WidgetActionButton
        style={settings.mobileLauncherStyle}
        ariaLabel={isOpen ? "إغلاق روابط السوشيال ميديا" : "فتح روابط السوشيال ميديا"}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span
          className="inline-flex [&_svg]:h-full [&_svg]:w-full"
          style={{ width: launcherIconSize, height: launcherIconSize }}
        >
          <AtIcon />
        </span>
      </WidgetActionButton>

      {isOpen
        ? links.map((link) => {
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
                  style={{ width: socialIconSize, height: socialIconSize }}
                >
                  <Icon />
                </span>
              </WidgetActionButton>
            );
          })
        : null}
    </div>
  );
}
