// src/app/api/admin/photos/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Prisma } from "../../generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function blobBaseFromConn(conn?: string) {
  if (!conn) return "";
  const m = conn.match(/AccountName=([^;]+)/i);
  if (m) return `https://${m[1]}.blob.core.windows.net/photos/`;
  return "http://127.0.0.1:10000/devstoreaccount1/photos/";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const photos = (await prisma.photo.findMany({
      orderBy: { createdAt: "desc" },
      include: { variants: true, keywords: true },
      take: 200,
    })) as Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true } }>[];

    const base = blobBaseFromConn(process.env.AZURE_STORAGE_CONNECTION_STRING);

    const items = photos.map((p) => {
      const thumb = p.variants.find((v) => v.type === "thumb");
      const large = p.variants.find((v) => v.type === "large");
      return {
        slug: p.slug,
        width: p.width,
        height: p.height,
        caption: p.caption,
        published: p.published,
        priceDigitalJPY: p.priceDigitalJPY ?? null,
        keywords: p.keywords?.map((k) => k.word) ?? [],
        urls: {
          original: base + p.storagePath,
          thumb: thumb ? base + thumb.storagePath : null,
          large: large ? base + large.storagePath : null,
        },
      };
    });

    return new NextResponse(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      status: 200,
    });
  } catch (e: any) {
    console.error("/api/admin/photos GET error:", e);
    return new NextResponse(JSON.stringify({ error: String(e?.message || e) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
}