import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { createSasGenerator } from "@/lib/azure-storage";
import { logger, serializeError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/photo" });

// --- ヘルパー関数 ---
const photoBySlugLimiter = createRateLimiter({ prefix: "photo:slug", limit: 120, windowMs: 60_000 });
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}
function checkHostOrigin(req: Request) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !ALLOWED_HOSTS.has(host)) { return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
  const origin = (req.headers.get("origin") || "").toLowerCase();
  if (origin) {
    try {
      const oh = new URL(origin).host.toLowerCase();
      if (!ALLOWED_HOSTS.has(oh)) { return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
    } catch { return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
  }
  return null;
}
function validateSlug(slug?: string): boolean {
  return !!slug && /^[a-z0-9-]{1,120}$/.test(slug);
}

// --- メインのGETハンドラ ---
export async function GET(
  req: NextRequest,
  context: any // 型推論に任せる
) {
  try {
    const { slug } = context.params;
    if (!validateSlug(slug)) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400, headers: { "Cache-control": "no-store" } });
    }

    const badOrigin = checkHostOrigin(req);
    if (badOrigin) return badOrigin;

    const { ok, resetSec } = await photoBySlugLimiter.hit(clientIp(req));
    if (!ok) {
      const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
      r.headers.set("Retry-After", String(resetSec));
      return r;
    }

    const photo = await prisma.photo.findUnique({
      where: { slug, published: true },
      include: { variants: true, keywords: true, photographer: true },
    });

    if (!photo) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-control": "no-store" } });
    }

    const getSignedUrl = createSasGenerator();
    const thumb = photo.variants.find(v => v.type === "thumb");
    const thumbWebp = photo.variants.find(v => v.type === "thumb-webp");
    const large = photo.variants.find(v => v.type === "large");

    const responseData = {
      slug: photo.slug,
      width: photo.width,
      height: photo.height,
      title: photo.title ?? null,
      caption: photo.caption,
      keywords: photo.keywords.map(k => k.word),
      priceDigitalJPY: photo.priceDigitalJPY ?? 11000,
      pricePrintA2JPY: photo.pricePrintA2JPY ?? 55000,
      sellDigital: photo.sellDigital ?? true,
      sellPanel: photo.sellPanel ?? true,
      photographer: photo.photographer
        ? {
            id: photo.photographer.id,
            slug: photo.photographer.slug,
            name: photo.photographer.name,
            displayName: photo.photographer.displayName ?? null,
          }
        : null,
      urls: {
        thumbWebp: thumbWebp ? await getSignedUrl(thumbWebp.storagePath, "photos") : null,
        thumb: thumb ? await getSignedUrl(thumb.storagePath, "photos") : null,
        large: large ? await getSignedUrl(large.storagePath, "photos") : null,
        watermarked: `/api/wm/${photo.slug}`,
      },
    };

    return NextResponse.json(responseData, {
      headers: {
        "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=60",
        Vary: "Accept-Encoding",
      },
    });

  } catch (e: any) {
    log.error("Photo detail handler failed", { err: serializeError(e) });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: { "Cache-control": "no-store" } });
  }
}
