// src/app/sitemap.xml/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const baseUrl = "https://www.momentia.photo";
  const now = new Date();

  const staticEntries = [
    {
      loc: `${baseUrl}/`,
      changefreq: "daily",
      priority: "1.0",
      lastmod: now,
    },
    {
      loc: `${baseUrl}/gallery`,
      changefreq: "daily",
      priority: "0.9",
      lastmod: now,
    },
    {
      loc: `${baseUrl}/photographers`,
      changefreq: "weekly",
      priority: "0.7",
      lastmod: now,
    },
    {
      loc: `${baseUrl}/blog`,
      changefreq: "weekly",
      priority: "0.6",
      lastmod: now,
    },
    {
      loc: `${baseUrl}/about`,
      changefreq: "monthly",
      priority: "0.4",
      lastmod: now,
    },
    {
      loc: `${baseUrl}/contact`,
      changefreq: "monthly",
      priority: "0.3",
      lastmod: now,
    },
  ];

  let blogEntries:
    | Array<{ loc: string; changefreq: string; priority: string; lastmod: Date }>
    | null = null;

  try {
    const posts = await prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      select: { slug: true, updatedAt: true, publishedAt: true },
      take: 200, // safety guard
    });

    blogEntries = posts.map((post) => ({
      loc: `${baseUrl}/blog/${post.slug}`,
      changefreq: "weekly",
      priority: "0.6",
      lastmod: post.updatedAt ?? post.publishedAt ?? new Date(),
    }));
  } catch (error) {
    // 失敗しても静的ページだけ返せるようにする
    blogEntries = null;
  }

  const urls = [...staticEntries, ...(blogEntries ?? [])];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls
    .map(
      (url) => `
  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod.toISOString()}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
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
