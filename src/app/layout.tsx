import type { Metadata } from "next";
import { Almarai, DM_Sans } from "next/font/google";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";
import { getThemeCssVariables, getThemeSettings } from "@/lib/theme-settings";

const almarai = Almarai({
  variable: "--font-sans-ar",
  subsets: ["arabic"],
  weight: ["300", "400", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-sans-en",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://sokany-eg.com"),
  manifest: "/manifest.webmanifest",
  applicationName: "SOKANY Egypt",
  title: {
    default: "SOKANY Egypt | مؤسسة المغربي الوكيل الحصري",
    template: "%s | SOKANY Egypt",
  },
  description:
    "تسوق منتجات سوكاني الأصلية في مصر من مؤسسة المغربي الوكيل الحصري مع ضمان عام، دفع فوري أو كاش عند الاستلام، وشحن داخل الجمهورية.",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SOKANY",
  },
};

async function resolveLocale() {
  const headerList = await headers();
  if (headerList.get("x-locale") === "en") {
    return "en" as const;
  }

  const cookieStore = await cookies();
  if (cookieStore.get("NEXT_LOCALE")?.value === "en") {
    return "en" as const;
  }

  return "ar" as const;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await resolveLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const settings = await getThemeSettings();

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${almarai.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body
        className={`flex min-h-full flex-col ${locale === "en" ? "font-en" : "font-ar"}`}
        style={getThemeCssVariables(settings)}
      >
        {children}
      </body>
    </html>
  );
}
