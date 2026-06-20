import type { NextConfig } from "next";

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

export default nextConfig;
