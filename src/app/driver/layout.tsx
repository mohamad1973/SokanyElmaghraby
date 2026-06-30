import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { DriverShell } from "./driver-shell";

export const metadata: Metadata = {
  title: "SOKANY Driver",
  description: "تطبيق مندوب التوصيل — SOKANY Egypt",
  manifest: "/driver-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SOKANY Driver",
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
