import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { CsShell } from "./cs-shell";

export const metadata: Metadata = {
  title: "sokany.cs",
  description: "تطبيق خدمة العملاء — تأكيد وتوزيع الطلبات",
  applicationName: "sokany.cs",
  manifest: "/cs-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "sokany.cs",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
