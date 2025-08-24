import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma, Variant, Keyword } from "@prisma/client";
import {
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  BlobServiceClient,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

function mask(s?: string | null, showPrefix = 3) {
  if (!s) return "(none)";
  if (s.length <= showPrefix) return `${s}***`;
  return `${s.slice(0, showPrefix)}***`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PhotoWithRels = Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true } }>;

const container = "photos";
const ACCOUNT_FROM_ENV = process.env.AZURE_STORAGE_ACCOUNT || null;

export async function GET(req: Request) {
  const t0 = Date.now();
  const searchParams = new URL(req.url).searchParams;
  const q = searchParams.get("q")?.trim();
  const kw = searchParams.get("keyword")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);

  const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
  const ACC = /AccountName=([^;]+)/i.exec(CONN)?.[1] ?? null;
  const KEY = /AccountKey=([^;]+)/i.exec(CONN)?.[1] ?? null;

  const ACCOUNT = ACCOUNT_FROM_ENV || ACC || null;

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

  const getSignedUrl = async (storagePath: string, ttlMinutes = 15): Promise<string | null> => {
    const now = new Date();
    const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
    const expiresOn = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    // MSI (AAD) 経路: User Delegation SAS を手動生成
    if (process.env.AZURE_USE_MSI === "1") {
      if (!ACCOUNT) return null;
      const endpoint = `https://${ACCOUNT}.blob.core.windows.net`;
      const svc = new BlobServiceClient(endpoint, new DefaultAzureCredential());
      try {
        const udk = await svc.getUserDelegationKey(startsOn, expiresOn);
        const sas = generateBlobSASQueryParameters(
          {
            containerName: container,
            blobName: storagePath,
            permissions: BlobSASPermissions.parse("r"),
            startsOn,
            expiresOn,
            version: "2021-08-06",
          },
          udk,
          ACCOUNT
        ).toString();
        return `${endpoint}/${container}/${encodeURI(storagePath)}?${sas}`;
      } catch (e) {
        console.error("[/api/photos] user-delegation-sas error", e);
        // フォールバックに続く
      }
    }

    // Fallback: Shared Key (接続文字列) での SAS 生成
    if (!ACC || !KEY) return null;
    const credential = new StorageSharedKeyCredential(ACC, KEY);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: container,
        blobName: storagePath,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn,
        version: "2021-08-06",
      },
      credential
    ).toString();
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

  const items = await Promise.all(photos.map(async (p) => {
    const thumb = p.variants.find((v: Variant) => v.type === "thumb");
    const large = p.variants.find((v: Variant) => v.type === "large");
    return {
      slug: p.slug, width: p.width, height: p.height, caption: p.caption,
      capturedAt: p.capturedAt, keywords: p.keywords.map((k: Keyword) => k.word),
      priceDigitalJPY: p.priceDigitalJPY ?? null,
      urls: {
        original: await getSignedUrl(p.storagePath),
        thumb: thumb ? await getSignedUrl(thumb.storagePath) : null,
        large: large ? await getSignedUrl(large.storagePath) : null,
      },
    };
  }));

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}