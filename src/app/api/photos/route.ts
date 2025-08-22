import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma, Variant, Keyword } from "@prisma/client";
import {
  StorageSharedKeyCredential,
  BlobSASPermissions,
  SASProtocol,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

function mask(s?: string | null, showPrefix = 3) {
  if (!s) return "(none)";
  if (s.length <= showPrefix) return `${s}***`;
  return `${s.slice(0, showPrefix)}***`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PhotoWithRels = Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true } }>;

const container = "photos";

export async function GET(req: Request) {
  const t0 = Date.now();
  const searchParams = new URL(req.url).searchParams;
  const q = searchParams.get("q")?.trim();
  const kw = searchParams.get("keyword")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);

  const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
  const ACC = /AccountName=([^;]+)/i.exec(CONN)?.[1] ?? null;
  const KEY = /AccountKey=([^;]+)/i.exec(CONN)?.[1] ?? null;

  // 最初の呼び出しでだけ環境の有無を軽くログ
  if ((globalThis as any).__photosBootLogged__ !== true) {
    (globalThis as any).__photosBootLogged__ = true;
    try {
      console.info("[/api/photos] boot env check(rt)", {
        hasConn: Boolean(CONN), hasAcc: Boolean(ACC), acc: mask(ACC),
        hasKey: Boolean(KEY), keyLen: KEY?.length ?? 0, nodeEnv: process.env.NODE_ENV,
      });
    } catch (e) {
      console.error("[/api/photos] env check logging failed", e);
    }
  }

  const getSignedUrl = (storagePath: string, ttlMinutes = 15): string | null => {
    if (!ACC || !KEY) return null;
    const credential = new StorageSharedKeyCredential(ACC, KEY);

    const now = new Date();
    const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
    const expiresOn = new Date(now.getTime() + 15 * 60 * 1000);

    const sas = generateBlobSASQueryParameters(
      { containerName: container, blobName: storagePath, permissions: BlobSASPermissions.parse("r"),
        protocol: SASProtocol.Https,
        startsOn, expiresOn,
        version: "2021-08-06"
      },
      credential
    ).toString();

    // 本番用のURLのみを返す
    return `https://${ACC}.blob.core.windows.net/${container}/${encodeURI(storagePath)}?${sas}`;
  };

  console.info("[/api/photos] request", { q, kw, limit });

  let photos: PhotoWithRels[] = [];
  try {
    photos = await prisma.photo.findMany({
      where: {
        AND: [ { published: true },
          q ? { OR: [{ caption: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {},
          kw ? { keywords: { some: { word: { equals: kw, mode: "insensitive" } } } } : {},
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { variants: true, keywords: true },
      take: limit,
    });
  } catch (err) {
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }

  const items = photos.map((p) => {
    const thumb = p.variants.find((v: Variant) => v.type === "thumb");
    const large = p.variants.find((v: Variant) => v.type === "large");
    return {
      slug: p.slug, width: p.width, height: p.height, caption: p.caption,
      capturedAt: p.capturedAt, keywords: p.keywords.map((k: Keyword) => k.word),
      priceDigitalJPY: p.priceDigitalJPY ?? null,
      urls: {
        original: getSignedUrl(p.storagePath),
        thumb: thumb ? getSignedUrl(thumb.storagePath) : null,
        large: large ? getSignedUrl(large.storagePath) : null,
      },
    };
  });

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}