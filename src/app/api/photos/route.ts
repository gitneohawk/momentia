import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma, Variant, Keyword } from "@prisma/client";
import {
  StorageSharedKeyCredential,
  BlobSASPermissions,
  SASProtocol,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// === Azure Blob (Azure 本番のみ) SAS 署名URL生成 ===
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const ACC = /AccountName=([^;]+)/i.exec(CONN)?.[1];
const KEY = /AccountKey=([^;]+)/i.exec(CONN)?.[1];

if (!ACC || !KEY) {
  // 起動時に環境変数が無いと 500 になるため、ログを残す
  console.warn("[/api/photos] Missing AZURE_STORAGE_CONNECTION_STRING (AccountName/AccountKey).");
}

const credential = ACC && KEY ? new StorageSharedKeyCredential(ACC, KEY) : null;
const container = "photos";

function signedUrl(storagePath: string, ttlMinutes = 15): string {
  if (!credential || !ACC) return ""; // 環境未設定時は空文字で返す（呼び出し側で null 判定可）

  const now = new Date();
  const startsOn = new Date(now.getTime() - 60 * 1000); // クロックスキュー吸収のため -1min
  const expiresOn = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName: storagePath,
      permissions: BlobSASPermissions.parse("r"), // 読み取り専用
      protocol: SASProtocol.Https,
      startsOn,
      expiresOn,
    },
    credential
  ).toString();

  return `https://${ACC}.blob.core.windows.net/${container}/${encodeURI(storagePath)}?${sas}`;
}

// relations を含む payload 型
type PhotoWithRels = Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true } }>;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const kw = searchParams.get("keyword")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);

  const photos = (await prisma.photo.findMany({
    where: {
      AND: [
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
      priceDigitalJPY: p.priceDigitalJPY ?? null,
      urls: {
        original: signedUrl(p.storagePath) || null,
        thumb: thumb ? signedUrl(thumb.storagePath) : null,
        large: large ? signedUrl(large.storagePath) : null,
      },
    };
  });

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}