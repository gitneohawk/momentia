import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma, Variant, Keyword } from "@prisma/client";
import {
  StorageSharedKeyCredential,
  BlobSASPermissions,
  SASProtocol,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

// ---- debug logging helpers (non-secret) ----
function mask(s?: string | null, showPrefix = 3) {
  if (!s) return "(none)";
  if (s.length <= showPrefix) return `${s}***`;
  return `${s.slice(0, showPrefix)}***`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// === Azure Blob (Azure 本番のみ) SAS 署名URL生成 ===
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const ACC = /AccountName=([^;]+)/i.exec(CONN)?.[1];
const KEY = /AccountKey=([^;]+)/i.exec(CONN)?.[1];

// 起動時に一度だけ環境チェックを出す（秘密は出さない）
try {
  const accMasked = mask(ACC);
  const keyInfo = KEY ? `len:${KEY.length}` : "(none)";
  console.info("[/api/photos] boot env check", {
    hasConn: Boolean(CONN),
    hasAcc: Boolean(ACC),
    acc: accMasked,
    hasKey: Boolean(KEY),
    key: keyInfo,
    nodeEnv: process.env.NODE_ENV,
  });
  if (!ACC || !KEY) {
    console.warn("[/api/photos] Missing AZURE_STORAGE_CONNECTION_STRING (AccountName/AccountKey).");
  }
} catch (e) {
  console.error("[/api/photos] env check logging failed", e);
}

const credential = ACC && KEY ? new StorageSharedKeyCredential(ACC, KEY) : null;
const container = "photos";

function signedUrl(storagePath: string, ttlMinutes = 15): string {
  if (!credential || !ACC) {
    // 生成不能時は空文字返却。呼び出し側で null 判定可。
    // 過度なログを避けるため、最初の数回のみ通知。
    if ((globalThis as any).__photosSignedUrlWarned__ !== true) {
      (globalThis as any).__photosSignedUrlWarned__ = true;
      console.warn("[/api/photos] signedUrl disabled (no credential). Returning empty URL.");
    }
    return "";
  }

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
  const t0 = Date.now();
  // Robust URL parsing (CI/prerender safety)
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(req.url).searchParams;
  } catch {
    // Fallback when req.url is somehow not absolute (shouldn't happen, but safer for CI)
    searchParams = new URLSearchParams();
  }
  const q = searchParams.get("q")?.trim();
  const kw = searchParams.get("keyword")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);

  console.info("[/api/photos] request", { q, kw, limit, hasCred: Boolean(credential) });

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

  console.info("[/api/photos] db result", { count: photos.length });

  let missingThumb = 0;
  let missingLarge = 0;

  const items = photos.map((p) => {
    const thumb = p.variants.find((v: Variant) => v.type === "thumb");
    const large = p.variants.find((v: Variant) => v.type === "large");

    if (!thumb) missingThumb++;
    if (!large) missingLarge++;

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

  const ms = Date.now() - t0;
  console.info("[/api/photos] response summary", { items: items.length, missingThumb, missingLarge, ms });

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}