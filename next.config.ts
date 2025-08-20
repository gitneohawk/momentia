import type { NextConfig } from "next";
import nextBundleAnalyzer from '@next/bundle-analyzer';

// Set up the bundle analyzer function
const withBundleAnalyzer = nextBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

// Your existing Next.js configuration
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
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

// Export the final config, wrapped by the analyzer
export default withBundleAnalyzer(nextConfig);
