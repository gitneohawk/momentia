import type { NextConfig } from "next";

const isAzurite =
  process.env.AZURE_STORAGE_CONNECTION_STRING?.includes("devstoreaccount1") ?? false;

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  images: {
    // Azurite では next/image の最適化を無効化
    unoptimized: isAzurite,
    remotePatterns: [
      // 開発（Azurite）
      { protocol: "http", hostname: "localhost",  port: "10000", pathname: "/devstoreaccount1/photos/**" },
      { protocol: "http", hostname: "azurite-1", port: "10000", pathname: "/devstoreaccount1/photos/**" },
      // 本番（Azure Blob）— ワイルドカードで許可
      { protocol: "https", hostname: "*.blob.core.windows.net", pathname: "/photos/**" },
    ],
  },
  // サーバで必要なネイティブパッケージ
  serverExternalPackages: ["@azure/identity", "@azure/storage-blob", "@prisma/client", "prisma"],
  async headers() {
    const securityHeaders = [
      ...baseSecurityHeaders,
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
