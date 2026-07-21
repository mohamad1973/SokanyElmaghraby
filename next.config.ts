import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sokany-eg.com",
      },
      {
        protocol: "https",
        hostname: "www.sokany.com",
      },
      {
        protocol: "https",
        hostname: "sokany.com",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
