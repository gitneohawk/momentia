import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [
      // Azurite / local dev
      { protocol: "http", hostname: "127.0.0.1", port: "10000", pathname: "/devstoreaccount1/photos/**" },
      { protocol: "http", hostname: "localhost",  port: "10000", pathname: "/devstoreaccount1/photos/**" },
      // Azure Blob (production)
      { protocol: "https", hostname: "momentia1.blob.core.windows.net", pathname: "/photos/**" },
      { protocol: "https", hostname: "momentiastorage.blob.core.windows.net", pathname: "/photos/**" },
    ],
  },
  // ← experimental.serverComponentsExternalPackages は使わない
  serverExternalPackages: ["@azure/identity", "@azure/storage-blob", "@prisma/client", "prisma"],
};

export default nextConfig;