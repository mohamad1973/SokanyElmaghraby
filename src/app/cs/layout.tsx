import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { CsShell } from "./cs-shell";

export const metadata: Metadata = {
  title: "Tooliano CS",
  description: "متابعة وتأكيد طلبات العملاء",
  manifest: "/cs-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tooliano CS",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#14213D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function CsLayout({ children }: { children: ReactNode }) {
  return <CsShell>{children}</CsShell>;
}
