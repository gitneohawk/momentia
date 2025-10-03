// src/app/api/photo/[slug]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PhotoWithRels = Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true } }> & {
  sellDigital?: boolean | null;
  sellPanel?: boolean | null;
};

function blobBaseFromConn(conn?: string) {
  if (!conn) return "";
  const m = conn.match(/AccountName=([^;]+)/i);
  if (m) return `https://${m[1]}.blob.core.windows.net/photos/`;
  return "http://127.0.0.1:10000/devstoreaccount1/photos/";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await ctx.params;
    const p: PhotoWithRels | null = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true, keywords: true },
    });
    if (!p || !p.published) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const base = blobBaseFromConn(process.env.AZURE_STORAGE_CONNECTION_STRING);
    const thumb = p.variants.find(v => v.type === "thumb");
    const large = p.variants.find(v => v.type === "large");

    return NextResponse.json({
      slug: p.slug,
      width: p.width,
      height: p.height,
      caption: p.caption,
      keywords: p.keywords.map(k => k.word),
      priceDigitalJPY: p.priceDigitalJPY ?? 11000,
      pricePrintA2JPY: p.pricePrintA2JPY ?? 55000,
      sellDigital: p.sellDigital ?? true,
      sellPanel: p.sellPanel ?? true,
      urls: {
        original: base + p.storagePath,
        thumb: thumb ? base + thumb.storagePath : null,
        large: large ? base + large.storagePath : null,
        // 購入ページのプレビューは透かしAPIを使うと安全
        watermarked: `/api/wm/${p.slug}`,
      },
    }, { headers: { "Cache-Control": "no-store" }});
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}