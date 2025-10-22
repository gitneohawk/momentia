import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma, Variant, Keyword, OrderStatus } from "@prisma/client";
import {
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  BlobServiceClient,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";

function mask(s?: string | null, showPrefix = 3) {
  if (!s) return "(none)";
  if (s.length <= showPrefix) return `${s}***`;
  return `${s.slice(0, showPrefix)}***`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/photos" });
const shouldLogDebug = process.env.DEBUG_API_PHOTOS === "1" || process.env.NODE_ENV !== "production";

const photosLimiter = createRateLimiter({ prefix: "photos:list", limit: 120, windowMs: 60_000 });
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

function checkHostOrigin(req: Request) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const origin = (req.headers.get("origin") || "").toLowerCase();
  if (origin) {
    try {
      const oh = new URL(origin).host.toLowerCase();
      if (!ALLOWED_HOSTS.has(oh)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
    } catch {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  }
  return null as Response | null;
}

// Cache TTL (API response) can be tuned by env. In dev, default to no-store.
const API_TTL_SEC =
  Number(process.env.API_PHOTOS_TTL_SEC ?? (process.env.NODE_ENV === "production" ? 600 : 0));
const API_SWR_SEC =
  Number(process.env.API_PHOTOS_SWR_SEC ?? (process.env.NODE_ENV === "production" ? 60 : 0));

type PhotoWithRels = Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true; photographer: true } }> & {
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

export async function GET(req: Request) {
  const searchParams = new URL(req.url).searchParams;
  const bad = checkHostOrigin(req);
  if (bad) return bad;

  const ip = clientIp(req);
  const { ok, resetSec } = await photosLimiter.hit(ip);
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }

  const rawLimit = Number(searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 100;
  const q = (searchParams.get("q")?.trim() || '').slice(0, 120);
  const kw = (searchParams.get("keyword")?.trim() || "").slice(0, 64);
  const rawPhotographer = (searchParams.get("photographer")?.trim() || "").toLowerCase();
  const photographerSlug =
    rawPhotographer && /^[a-z0-9-]{1,120}$/.test(rawPhotographer) ? rawPhotographer : null;
  const wantFeatured = (() => {
    const ft = (searchParams.get("featured") || "").toLowerCase();
    return ft === "1" || ft === "true";
  })();

  const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
  const ACC = /AccountName=([^;]+)/i.exec(CONN)?.[1] ?? null;
  const KEY = /AccountKey=([^;]+)/i.exec(CONN)?.[1] ?? null;

  const ACCOUNT = ACCOUNT_FROM_ENV || ACC || null;

  // 最初の呼び出しでだけ環境の有無を軽くログ
  if ((globalThis as any).__photosBootLogged__ !== true) {
    (globalThis as any).__photosBootLogged__ = true;
    if (shouldLogDebug) {
      try {
        log.info("Photos API boot env check", {
          hasConn: Boolean(CONN),
          hasAcc: Boolean(ACC),
          acc: mask(ACC),
          hasKey: Boolean(KEY),
          keyLen: KEY?.length ?? 0,
          nodeEnv: process.env.NODE_ENV,
        });
      } catch (e) {
        log.error("Photos API env check logging failed", { err: serializeError(e) });
      }
    }
  }

  // Cache SAS per request, but also track expiry to avoid serving stale signatures
  type SasEntry = { url: string; expiresAt: number }; // epoch ms
  const sasCache = new Map<string, SasEntry>();
  const isFresh = (e: SasEntry | undefined) => {
    if (!e) return false;
    // refresh if less than 30s remaining
    return e.expiresAt - Date.now() > 30_000;
  };

  const now = new Date();
  // Ensure SAS lifetime comfortably exceeds API cache TTL to avoid 403 due to expiry.
  // Margin: +300s (5min). Minimum 15 minutes.
  const SIGNED_TTL_MIN = Math.max(15, Math.ceil((API_TTL_SEC + 300) / 60));
  // allow wider skew window to avoid "Authorization" 403 due to clock drift (overridable by env)
  const SKEW_MIN = Number(process.env.SAS_SKEW_MINUTES ?? 10); // default 10min backdating
  // round seconds to avoid ms-level drift issues
  const round = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000);
  const startsOn = round(new Date(now.getTime() - SKEW_MIN * 60 * 1000));
  // NOTE: per-call TTL applied later via localExpiresOn

  const getSignedUrl = async (
    storagePath: string,
    ttlMinutes = 15,
    containerName: string = container
  ): Promise<string | null> => {
    const key = `${containerName}|${storagePath}|${ttlMinutes}`;
    const cached = sasCache.get(key);
    if (isFresh(cached)) return cached!.url;

    // use shared window but respect ttl override
    const localExpiresOn = round(new Date(now.getTime() + ttlMinutes * 60 * 1000));
    const expiresAt = localExpiresOn.getTime();

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
        sasCache.set(key, { url, expiresAt });
        return url;
      } catch (e) {
        log.error("Photos API user delegation SAS error", { err: serializeError(e) });
        // フォールバックに続く
      }
    }

    // Fallback: Shared Key (接続文字列) での SAS 生成（AzURITE の BlobEndpoint も尊重）
    try {
      // compute local expiry
      const localExpiresOn = round(new Date(now.getTime() + ttlMinutes * 60 * 1000));
      const expiresAt = localExpiresOn.getTime();
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
      sasCache.set(key, { url, expiresAt });
      return url;
    } catch (e) {
      log.error("Photos API shared key SAS error", { err: serializeError(e) });
      return null;
    }
  };

  if (shouldLogDebug) {
    log.info("Photos API request", { q, kw, limit, photographer: photographerSlug });
  }

  const baseWhere: Prisma.PhotoWhereInput = {
    AND: [
      { published: true },
      q
        ? {
            OR: [
              { caption: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      kw ? { keywords: { some: { word: { equals: kw, mode: "insensitive" } } } } : {},
      photographerSlug ? { photographer: { slug: photographerSlug } } : {},
    ],
  };

  let photos: PhotoWithRels[] = [];
  const salesMetrics = new Map<string, { totalSalesJpy: number; salesCount: number }>();

  try {
    if (wantFeatured && !q && !kw) {
      const salesStatuses: OrderStatus[] = ["paid", "processing", "shipped"];
      const aggregates = await prisma.order.groupBy({
        by: ["slug"],
        where: {
          slug: { not: null },
          status: { in: salesStatuses },
        },
        _sum: { amountJpy: true },
        _count: { slug: true },
        orderBy: [
          { _sum: { amountJpy: "desc" } },
          { _count: { slug: "desc" } },
        ],
        take: Math.max(limit * 2, 6),
      });

      const rankedSlugs: string[] = [];
      for (const entry of aggregates) {
        if (!entry.slug) continue;
        if (!entry._sum?.amountJpy && !entry._count?.slug) continue;
        if (!rankedSlugs.includes(entry.slug)) {
          rankedSlugs.push(entry.slug);
          salesMetrics.set(entry.slug, {
            totalSalesJpy: entry._sum?.amountJpy ?? 0,
            salesCount: entry._count?.slug ?? 0,
          });
        }
      }

      if (rankedSlugs.length > 0) {
        const soldPhotos = await prisma.photo.findMany({
          where: {
            ...baseWhere,
            slug: { in: rankedSlugs },
          },
          include: { variants: true, keywords: true, photographer: true },
        });
        const map = new Map(soldPhotos.map((p) => [p.slug, p]));
        for (const slug of rankedSlugs) {
          const hit = map.get(slug);
          if (hit) {
            photos.push(hit);
            if (photos.length >= limit) break;
          }
        }
      }

      if (photos.length < limit) {
        const fallback = await prisma.photo.findMany({
          where: {
            ...baseWhere,
            slug: { notIn: photos.map((p) => p.slug) },
          },
          orderBy: { createdAt: "desc" },
          include: { variants: true, keywords: true, photographer: true },
          take: limit - photos.length,
        });
        photos = photos.concat(fallback);
      }
    } else {
      photos = await prisma.photo.findMany({
        where: baseWhere,
        orderBy: { createdAt: "desc" },
        include: { variants: true, keywords: true, photographer: true },
        take: limit,
      });
    }
  } catch (err) {
    log.error("Photos API fetch failed", { err: serializeError(err) });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  const items = await Promise.all(photos.map(async (p) => {
    const thumb = p.variants.find((v: Variant) => v.type === "thumb");
    const thumbWebp = p.variants.find((v: Variant) => v.type === "thumb-webp");
    const large = p.variants.find((v: Variant) => v.type === "large");
    const wmName = `${p.slug}_wm_2048_v1.jpg`;
    return {
      slug: p.slug,
      width: thumb ? thumb.width : p.width,
      height: thumb ? thumb.height : p.height,
      caption: p.caption,
      capturedAt: p.capturedAt,
      keywords: p.keywords.map((k: Keyword) => k.word),
      priceDigitalJPY: p.priceDigitalJPY ?? null,
      pricePrintA2JPY: p.pricePrintA2JPY ?? null,
      sellDigital: p.sellDigital ?? true,
      sellPanel: p.sellPanel ?? true,
      photographer: p.photographer
        ? {
            id: p.photographer.id,
            slug: p.photographer.slug,
            name: p.photographer.name,
            displayName: p.photographer.displayName ?? null,
          }
        : null,
      urls: {
        thumbWebp: thumbWebp ? await getSignedUrl(thumbWebp.storagePath, SIGNED_TTL_MIN) : null,
        thumb: thumb ? await getSignedUrl(thumb.storagePath, SIGNED_TTL_MIN) : null,
        large: large ? await getSignedUrl(large.storagePath, SIGNED_TTL_MIN) : null,
        watermarked: await getSignedUrl(wmName, SIGNED_TTL_MIN, "watermarks"),
      },
      metrics: salesMetrics.get(p.slug) ?? null,
    };
  }));

  return NextResponse.json(
    { items },
    {
      headers:
        API_TTL_SEC > 0
          ? {
              // Browser & CDN cache (controlled via env for PROD): keep fresh for API_TTL_SEC
              // Allow brief SWR window for smoother UX
              "Cache-Control": `public, max-age=${API_TTL_SEC}, s-maxage=${API_TTL_SEC}, stale-while-revalidate=${API_SWR_SEC}`,
              Vary: "Accept-Encoding",
            }
          : {
              // Dev/default: disable caching to avoid confusion while iterating
              "Cache-Control": "no-store",
              Vary: "Accept-Encoding",
            },
    }
  );
}
