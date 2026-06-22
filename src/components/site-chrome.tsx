"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { ThemeSettings } from "@/lib/theme-settings";
import type { MenuNode } from "@/lib/types";

import { Footer } from "./footer";
import { Header } from "./header";
import { PwaInstallPrompt } from "./pwa-install-prompt";
import { VisualEditorProvider } from "./visual-editor-provider";

export function SiteChrome({
  children,
  settings,
  menu,
}: {
  children: ReactNode;
  settings: ThemeSettings;
  menu: MenuNode[];
}) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return children;
  }

  return (
    <VisualEditorProvider settings={settings}>
      <Header settings={settings} menu={menu} />
      <main className="flex-1">{children}</main>
      <Footer settings={settings} />
      <PwaInstallPrompt />
    </VisualEditorProvider>
  );
}

