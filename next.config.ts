import type { NextConfig } from "next";

const isAzurite =
  process.env.AZURE_STORAGE_CONNECTION_STRING?.includes("devstoreaccount1") ?? false;

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
  // --- ▼▼▼ ここから追加 ▼▼▼ ---
  api: {
    bodyParser: {
      sizeLimit: '100mb', // アップロード上限を20MBに設定
    },
  },
  // --- ▲▲▲ ここまで追加 ▲▲▲ ---
  // サーバで必要なネイティブパッケージ
  serverExternalPackages: ["@azure/identity", "@azure/storage-blob", "@prisma/client", "prisma"],
};

export default nextConfig;