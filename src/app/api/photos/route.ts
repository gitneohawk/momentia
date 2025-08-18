import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma, Variant, Keyword } from "@prisma/client";

function blobBaseFromConn(conn?: string) {
  if (!conn) return "";
  const m = conn.match(/AccountName=([^;]+)/i);
  if (m) return `https://${m[1]}.blob.core.windows.net/photos/`;
  return "http://127.0.0.1:10000/devstoreaccount1/photos/";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 型を明示して、relations を含む payload を扱えるようにする
type PhotoWithRels = Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true } }>;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const kw = searchParams.get("keyword")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);

  const photos = (await prisma.photo.findMany({
    where: {
      AND: [
        // Prisma Client 型が古い環境でも通るよう、一時的に any キャスト
        { published: true } as any,
        q
          ? ({
              OR: [
                { caption: { contains: q, mode: "insensitive" } },
                { slug: { contains: q, mode: "insensitive" } },
              ],
            } as any)
          : ({} as any),
        kw
          ? ({ keywords: { some: { word: { equals: kw, mode: "insensitive" } } } } as any)
          : ({} as any),
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { variants: true, keywords: true },
    take: limit,
  })) as PhotoWithRels[];

  const base = blobBaseFromConn(process.env.AZURE_STORAGE_CONNECTION_STRING);

  const items = photos.map((p) => {
    const thumb = p.variants.find((v: Variant) => v.type === "thumb");
    const large = p.variants.find((v: Variant) => v.type === "large");
    return {
      slug: p.slug,
      width: p.width,
      height: p.height,
      caption: p.caption,
      capturedAt: p.capturedAt,
      keywords: p.keywords.map((k: Keyword) => k.word),
      priceDigitalJPY: p.priceDigitalJPY ?? null, // ← 追加
      urls: {
        original: base + p.storagePath,
        thumb: thumb ? base + thumb.storagePath : null,
        large: large ? base + large.storagePath : null,
      },
    };
  });

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}