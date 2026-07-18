"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { ThemeSettings } from "@/lib/theme-settings";
import type { MenuNode } from "@/lib/types";

import { CompareFloatingBar } from "./compare-floating-bar";
import { FloatingActionButtons } from "./floating-action-buttons";
import { Footer } from "./footer";
import { buildHeaderMenu, Header } from "./header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MobileNavProvider } from "./mobile-nav-context";
import { MobileSideDrawer } from "./mobile-side-drawer";
import { MobileSocialLauncher } from "./mobile-social-launcher";
import { CartProvider } from "./cart-provider";
import { ProductDisplayProvider } from "./product-display-context";
import { ProductListsProvider } from "./product-lists-provider";
import { PwaInstallPrompt } from "./pwa-install-prompt";
import { OrderSocialProofToast } from "./order-social-proof-toast";
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

  const headerMenu = buildHeaderMenu(settings, menu);

  return (
    <CartProvider>
      <ProductListsProvider>
        <ProductDisplayProvider codeMode={settings.productCard.codeMode}>
          <VisualEditorProvider settings={settings}>
            <MobileNavProvider>
              <Header settings={settings} menu={menu} />
              <VisualEditorToolbar />
              <main className="flex-1 pb-20 lg:pb-0">{children}</main>
              <Footer settings={settings} />
              <SocialMediaSidebar settings={settings.socialMedia} />
              <MobileSocialLauncher settings={settings.socialMedia} />
              <CompareFloatingBar />
              <FloatingActionButtons settings={settings.floatingActions} />
              <MobileSideDrawer menu={headerMenu} />
              <MobileBottomNav />
              <PwaInstallPrompt />
              <OrderSocialProofToast />
            </MobileNavProvider>
          </VisualEditorProvider>
        </ProductDisplayProvider>
      </ProductListsProvider>
    </CartProvider>
  );
}
