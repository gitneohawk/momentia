// src/app/api/photo/[slug]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { createRateLimiter } from "@/lib/rate-limit";
import { generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from "@azure/storage-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const photoBySlugLimiter = createRateLimiter({ prefix: "photo:slug", limit: 120, windowMs: 60_000 });

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

function validateSlug(slug?: string): boolean {
  if (!slug) return false;
  return /^[a-z0-9-]{1,120}$/.test(slug);
}

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

function makeSignedUrl(blobUrl: string): string {
  try {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT || new URL(blobUrl).hostname.split('.')[0];
    const accountKey = process.env.AZURE_STORAGE_KEY;
    if (!accountKey) return blobUrl; // fallback
    const cred = new StorageSharedKeyCredential(accountName, accountKey);
    const u = new URL(blobUrl);
    const containerName = u.pathname.split('/')[1];
    const blobName = u.pathname.split('/').slice(2).join('/');
    const expiresOn = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const sas = generateBlobSASQueryParameters({
      containerName,
      blobName,
      permissions: BlobSASPermissions.from({ read: true }),
      startsOn: new Date(),
      expiresOn,
    }, cred).toString();
    return `${blobUrl}?${sas}`;
  } catch {
    return blobUrl;
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await ctx.params;
    if (!validateSlug(slug)) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const bad = checkHostOrigin(req);
    if (bad) return bad;
    const { ok, resetSec } = await photoBySlugLimiter.hit(clientIp(req));
    if (!ok) {
      const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
      r.headers.set("Retry-After", String(resetSec));
      return r;
    }
    const p: PhotoWithRels | null = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true, keywords: true },
    });
    if (!p || !p.published) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const base = blobBaseFromConn(process.env.AZURE_STORAGE_CONNECTION_STRING);
    const thumb = p.variants.find(v => v.type === "thumb");
    const large = p.variants.find(v => v.type === "large");

    return NextResponse.json(
      {
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
          original: makeSignedUrl(base + p.storagePath),
          thumb: thumb ? makeSignedUrl(base + thumb.storagePath) : null,
          large: large ? makeSignedUrl(base + large.storagePath) : null,
          watermarked: `/api/wm/${p.slug}`,
        },
      },
      {
        headers: {
          // Cache for 10 minutes client/CDN, SWR 1 minute for smoother UX
          "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=60",
          Vary: "Accept-Encoding",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}