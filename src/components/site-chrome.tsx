"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { ThemeSettings } from "@/lib/theme-settings";
import type { MenuNode } from "@/lib/types";

import { CompareFloatingBar } from "./compare-floating-bar";
import { FloatingActionButtons } from "./floating-action-buttons";
import { Footer } from "./footer";
import { Header } from "./header";
import { ProductDisplayProvider } from "./product-display-context";
import { ProductListsProvider } from "./product-lists-provider";
import { PwaInstallPrompt } from "./pwa-install-prompt";
import { SocialMediaSidebar } from "./social-media-sidebar";
import { VisualEditorProvider } from "./visual-editor-provider";
import { VisualEditorToolbar } from "./visual-editor-toolbar";

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
    <ProductListsProvider>
      <ProductDisplayProvider codeMode={settings.productCard.codeMode}>
        <VisualEditorProvider settings={settings}>
          <Header settings={settings} menu={menu} />
          <VisualEditorToolbar />
          <main className="flex-1">{children}</main>
          <Footer settings={settings} />
          <SocialMediaSidebar settings={settings.socialMedia} />
          <CompareFloatingBar />
          <FloatingActionButtons settings={settings.floatingActions} />
          <PwaInstallPrompt />
        </VisualEditorProvider>
      </ProductDisplayProvider>
    </ProductListsProvider>
  );
}

