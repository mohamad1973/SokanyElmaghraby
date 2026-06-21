import type { Metadata } from "next";
import { Almarai } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/site-chrome";
import { getHeaderMenu } from "@/lib/menu";
import { getThemeCssVariables, getThemeSettings } from "@/lib/theme-settings";

const almarai = Almarai({
  variable: "--font-sans-ar",
  subsets: ["arabic"],
  weight: ["300", "400", "700", "800"],
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
  keywords: [
    "سوكاني",
    "SOKANY Egypt",
    "مؤسسة المغربي",
    "الوكيل الحصري لسوكاني",
    "أجهزة مطبخ",
    "أجهزة عناية شخصية",
  ],
  openGraph: {
    title: "SOKANY Egypt",
    description: "منتجات سوكاني الأصلية بضمان مؤسسة المغربي في مصر.",
    url: "https://sokany-eg.com",
    siteName: "SOKANY Egypt",
    locale: "ar_EG",
    type: "website",
  },
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [settings, menu] = await Promise.all([getThemeSettings(), getHeaderMenu()]);

  return (
    <html lang="ar" dir="rtl" className={`${almarai.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col" style={getThemeCssVariables(settings)}>
        <SiteChrome settings={settings} menu={menu}>{children}</SiteChrome>
      </body>
    </html>
  );
}
