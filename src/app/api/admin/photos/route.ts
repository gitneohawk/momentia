// src/app/api/admin/photos/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isAdminEmail } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/admin/photos" });

const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const adminPhotosLimiter = createRateLimiter({ prefix: "admin:photos", limit: 60, windowMs: 60_000 });

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

const ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT || "";
const CONTAINER = "photos";

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
  return { endpoint, cred, accountName };
}

function getPublicBase(endpoint: string) {
  const pub = process.env.AZURE_BLOB_PUBLIC_ENDPOINT;
  if (pub && pub.trim().length > 0) return pub.replace(/\/+$/, "");
  return endpoint.replace(/\/+$/, "");
}

async function getSignedUrl(storagePath: string, ttlMinutes = 60): Promise<string> {
  const now = new Date();
  const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
  const expiresOn = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  // MSI 経路（User Delegation SAS）
  if (process.env.AZURE_USE_MSI === "1" && ACCOUNT) {
    // Prefer connection string endpoint when available (AzURITE 対応)
    let endpoint = `https://${ACCOUNT}.blob.core.windows.net`;
    try {
      const { endpoint: ep } = getEndpointAndCred();
      endpoint = ep;
    } catch {}
    const svc = new BlobServiceClient(endpoint, new DefaultAzureCredential());
    try {
      const udk = await svc.getUserDelegationKey(startsOn, expiresOn);
      const sas = generateBlobSASQueryParameters(
        {
          containerName: CONTAINER,
          blobName: storagePath,
          permissions: BlobSASPermissions.parse("r"),
          startsOn,
          expiresOn,
          version: "2021-08-06",
        },
        udk,
        ACCOUNT
      ).toString();
      const publicBase = getPublicBase(endpoint);
      return `${publicBase}/${CONTAINER}/${encodeURI(storagePath)}?${sas}`;
    } catch (e) {
      log.error("Admin photos MSI SAS error", { err: serializeError(e) });
      // フォールバックへ
    }
  }

  // 共有キー（接続文字列）フォールバック（AzURITE の BlobEndpoint も尊重）
  const { endpoint, cred } = getEndpointAndCred();
  const publicBase = getPublicBase(endpoint);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER,
      blobName: storagePath,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
      version: "2021-08-06",
    },
    cred
  ).toString();
  return `${publicBase}/${CONTAINER}/${encodeURI(storagePath)}?${sas}`;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await adminPhotosLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }
  try {
    const photos = (await prisma.photo.findMany({
      orderBy: { createdAt: "desc" },
      include: { variants: true, keywords: true, photographer: true },
      take: 200,
    })) as Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true; photographer: true } }>[];

    const items = await Promise.all(
      photos.map(async (p) => {
        const thumb = p.variants.find((v) => v.type === "thumb");
        const thumbWebp = p.variants.find((v) => v.type === "thumb-webp");
        const large = p.variants.find((v) => v.type === "large");
        return {
          slug: p.slug,
          width: p.width,
          height: p.height,
          title: p.title ?? null,
          caption: p.caption,
          published: p.published,
          sellDigital: (p as any)?.sellDigital ?? true,
          sellPanel: (p as any)?.sellPanel ?? true,
          priceDigitalJPY: p.priceDigitalJPY ?? null,
          pricePrintA2JPY: p.pricePrintA2JPY ?? null,
          keywords: p.keywords?.map((k) => k.word) ?? [],
          photographerId: p.photographerId ?? null,
          photographer: p.photographer
            ? {
                id: p.photographer.id,
                slug: p.photographer.slug,
                name: p.photographer.name,
                displayName: p.photographer.displayName,
              }
            : null,
          urls: {
            original: await getSignedUrl(p.storagePath),
            thumbWebp: thumbWebp ? await getSignedUrl(thumbWebp.storagePath) : null,
            thumb: thumb ? await getSignedUrl(thumb.storagePath) : null,
            large: large ? await getSignedUrl(large.storagePath) : null,
          },
        };
      })
    );

    return new NextResponse(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      status: 200,
    });
  } catch (_err: any) {
    log.error("Admin photos list failed", { err: serializeError(_err) });
    return new NextResponse(JSON.stringify({ error: String(_err?.message || _err) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
}
