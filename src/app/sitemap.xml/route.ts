// src/app/sitemap.xml/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = "https://www.momentia.photo";

  // 公開したいページをリストアップ（今は固定でもOK）
  const urls = [
    `${baseUrl}/`,
    `${baseUrl}/about`,
    `${baseUrl}/contact`,
    // 動的ルート (例: gallery) は DB から取ってきても良い
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls
    .map(
      (url) => `
  <url>
    <loc>${url}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    )
    .join("")}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}