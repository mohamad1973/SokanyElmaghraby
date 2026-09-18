import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { DriverShell } from "./driver-shell";

export const metadata: Metadata = {
  title: "Tooliano Driver",
  description: "تطبيق مندوب التوصيل — Tooliano",
  manifest: "/driver-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tooliano Driver",
  },
};

export const viewport: Viewport = {
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function DriverLayout({ children }: { children: ReactNode }) {
  return <DriverShell>{children}</DriverShell>;
}
