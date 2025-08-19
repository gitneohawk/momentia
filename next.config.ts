import type { NextConfig } from "next";

// Unified Next.js config (TS). Remove next.config.js after this is applied.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Azurite / local dev
      { protocol: "http", hostname: "127.0.0.1", port: "10000", pathname: "/devstoreaccount1/photos/**" },
      { protocol: "http", hostname: "localhost",  port: "10000", pathname: "/devstoreaccount1/photos/**" },

      // Azure Blob (production)
      { protocol: "https", hostname: "momentia1.blob.core.windows.net", pathname: "/photos/**" },
    ],
  },
};

export default nextConfig;
