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

type PhotoWithRels = Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true } }> & {
  sellDigital?: boolean | null;
  sellPanel?: boolean | null;
};

const container = "photos";
const ACCOUNT_FROM_ENV = process.env.AZURE_STORAGE_ACCOUNT || null;

function parseConnString(raw: string) {
  const s = raw.trim().replace(/^\s*["']|["']\s*$/g, "");
  const entries = s
    .split(";")
    .map((kv): [string, string] | null => {
      const i = kv.indexOf("=");
      if (i === -1) return null;
      const k = kv.slice(0, i).trim();
      const v = kv.slice(i + 1).trim();
      return k && v ? [k, v] : null;
    })
    .filter((e): e is [string, string] => !!e);
  const map = new Map<string, string>(entries);
  const accountName = map.get("AccountName");
  const accountKey = map.get("AccountKey");
  if (!accountName || !accountKey) throw new Error("Invalid storage connection string");
  const blobEndpoint = map.get("BlobEndpoint");
  const protocol = map.get("DefaultEndpointsProtocol") || "https";
  const endpointSuffix = map.get("EndpointSuffix") || "core.windows.net";
  const endpoint = blobEndpoint || `${protocol}://${accountName}.blob.${endpointSuffix}`;
  return { accountName, accountKey, endpoint };
}

function getEndpointAndCred() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("missing storage connection");
  const { accountName, accountKey, endpoint } = parseConnString(conn);
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  return { endpoint, cred };
}

function getPublicBase(endpoint: string) {
  const pub = process.env.AZURE_BLOB_PUBLIC_ENDPOINT;
  if (pub && pub.trim().length > 0) {
    return pub.replace(/\/+$/, "");
  }
  return endpoint.replace(/\/+$/, "");
}

// info log helper: mute in production unless explicitly enabled
const logInfo = (...args: any[]) => {
  if (process.env.DEBUG_API_PHOTOS === "1" || process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    (console.info as any)(...args);
  }
};

export async function GET(req: Request) {
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
      logInfo("[/api/photos] boot env check(rt)", {
        hasConn: Boolean(CONN), hasAcc: Boolean(ACC), acc: mask(ACC),
        hasKey: Boolean(KEY), keyLen: KEY?.length ?? 0, nodeEnv: process.env.NODE_ENV,
      });
    } catch (e) {
      console.error("[/api/photos] env check logging failed", e);
    }
  }

  // --- perf: per-request SAS cache & shared time window ---
  const sasCache = new Map<string, string>();
  const now = new Date();
  const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
  const expiresOn = new Date(now.getTime() + 15 * 60 * 1000); // default 15 min; overridden by arg if needed

  const getSignedUrl = async (
    storagePath: string,
    ttlMinutes = 15,
    containerName: string = container
  ): Promise<string | null> => {
    const key = `${containerName}|${storagePath}|${ttlMinutes}`;
    const cached = sasCache.get(key);
    if (cached) return cached;

    // use shared window but respect ttl override
    const localExpiresOn = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    // MSI (AAD) 経路: User Delegation SAS を手動生成
    if (process.env.AZURE_USE_MSI === "1") {
      if (!ACCOUNT) return null;
      let endpoint = `https://${ACCOUNT}.blob.core.windows.net`;
      try {
        const { endpoint: ep } = getEndpointAndCred();
        endpoint = ep;
      } catch {}
      const svc = new BlobServiceClient(endpoint, new DefaultAzureCredential());
      try {
        const udk = await svc.getUserDelegationKey(startsOn, localExpiresOn);
        const sas = generateBlobSASQueryParameters(
          {
            containerName,
            blobName: storagePath,
            permissions: BlobSASPermissions.parse("r"),
            startsOn,
            expiresOn: localExpiresOn,
            version: "2021-08-06",
          },
          udk,
          ACCOUNT
        ).toString();
        const publicBase = getPublicBase(endpoint);
        const url = `${publicBase}/${containerName}/${encodeURI(storagePath)}?${sas}`;
        sasCache.set(key, url);
        return url;
      } catch (e) {
        console.error("[/api/photos] user-delegation-sas error", e);
        // フォールバックに続く
      }
    }

    // Fallback: Shared Key (接続文字列) での SAS 生成（AzURITE の BlobEndpoint も尊重）
    try {
      const { endpoint, cred } = getEndpointAndCred();
      const sas = generateBlobSASQueryParameters(
        {
          containerName,
          blobName: storagePath,
          permissions: BlobSASPermissions.parse("r"),
          startsOn,
          expiresOn: localExpiresOn,
          version: "2021-08-06",
        },
        cred
      ).toString();
      const publicBase = getPublicBase(endpoint);
      const url = `${publicBase}/${containerName}/${encodeURI(storagePath)}?${sas}`;
      sasCache.set(key, url);
      return url;
    } catch (e) {
      console.error("[/api/photos] shared-key-sas error", e);
      return null;
    }
  };

  logInfo("[/api/photos] request", { q, kw, limit });

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
    console.error("Error occurred:", err); // エラー内容をログに出力
  }

  const items = await Promise.all(photos.map(async (p) => {
    const thumb = p.variants.find((v: Variant) => v.type === "thumb");
    const large = p.variants.find((v: Variant) => v.type === "large");
    const wmName = `${p.slug}_wm_2048_v1.jpg`;
    return {
      slug: p.slug, width: p.width, height: p.height, caption: p.caption,
      capturedAt: p.capturedAt, keywords: p.keywords.map((k: Keyword) => k.word),
      priceDigitalJPY: p.priceDigitalJPY ?? null,
      pricePrintA2JPY: p.pricePrintA2JPY ?? null,
      sellDigital: p.sellDigital ?? true,
      sellPanel: p.sellPanel ?? true,
      urls: {
        original: await getSignedUrl(p.storagePath),
        thumb: thumb ? await getSignedUrl(thumb.storagePath) : null,
        large: large ? await getSignedUrl(large.storagePath) : null,
        watermarked: await getSignedUrl(wmName, 15, "watermarks"),
      },
    };
  }));

  return NextResponse.json(
    { items },
    {
      headers: {
        // Browser & CDN cache: 10 minutes; allow brief SWR window for smoother UX
        "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=60",
        // Safety: avoid intermediary confusion (optional but harmless)
        Vary: "Accept-Encoding",
      },
    }
  );
}