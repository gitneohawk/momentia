import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma, Variant, Keyword } from "@prisma/client";
import { createRateLimiter } from "@/lib/rate-limit";
import { createSasGenerator } from "@/lib/azure-storage"; // ★ 共通のSAS生成関数をインポート

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- ヘルパー関数 ---
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

const logInfo = (...args: any[]) => {
  if (process.env.DEBUG_API_PHOTOS === "1" || process.env.NODE_ENV !== "production") {
    console.info(...args);
  }
};

// --- メインのGETハンドラ ---
export async function GET(req: NextRequest) {
  const badOrigin = checkHostOrigin(req);
  if (badOrigin) return badOrigin;

  const ip = clientIp(req);
  const { ok, resetSec } = await photosLimiter.hit(ip);
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }

  // ★ 共通のSAS生成関数を呼び出す
  const getSignedUrl = createSasGenerator();
  
  const searchParams = req.nextUrl.searchParams;
  logInfo("[/api/photos] request", { 
    q: searchParams.get("q"), 
    kw: searchParams.get("keyword"),
    limit: searchParams.get("limit")
  });

  let photos: (Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true } }>)[] = [];
  try {
    const rawLimit = Number(searchParams.get("limit") ?? 100);
    const limit = Math.max(1, Math.min(rawLimit, 200));
    const q = (searchParams.get("q")?.trim() || '').slice(0, 120);
    const kw = (searchParams.get("keyword")?.trim() || '').slice(0, 64);
    
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
    console.error("[/api/photos] Prisma findMany error:", err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  const items = await Promise.all(
    photos.map(async (p) => {
      const thumb = p.variants.find((v) => v.type === "thumb");
      const large = p.variants.find((v) => v.type === "large");
      const wmName = `${p.slug}_wm_2048_v1.jpg`;

      const urls = {
        original: await getSignedUrl(p.storagePath, "photos"),
        thumb: thumb ? await getSignedUrl(thumb.storagePath, "photos") : null,
        large: large ? await getSignedUrl(large.storagePath, "photos") : null,
        watermarked: await getSignedUrl(wmName, "watermarks"),
      };

      return {
        slug: p.slug, width: p.width, height: p.height, caption: p.caption,
        capturedAt: p.capturedAt, keywords: p.keywords.map((k) => k.word),
        priceDigitalJPY: p.priceDigitalJPY ?? null,
        pricePrintA2JPY: p.pricePrintA2JPY ?? null,
        sellDigital: p.sellDigital ?? true,
        sellPanel: p.sellPanel ?? true,
        urls,
      };
    })
  );

  const API_TTL_SEC = Number(process.env.API_PHOTOS_TTL_SEC ?? (process.env.NODE_ENV === "production" ? 600 : 0));
  const API_SWR_SEC = Number(process.env.API_PHOTOS_SWR_SEC ?? (process.env.NODE_ENV === "production" ? 60 : 0));

  return NextResponse.json({ items }, {
    headers: API_TTL_SEC > 0
      ? {
          "Cache-Control": `public, max-age=${API_TTL_SEC}, s-maxage=${API_TTL_SEC}, stale-while-revalidate=${API_SWR_SEC}`,
          Vary: "Accept-Encoding",
        }
      : {
          "Cache-Control": "no-store",
        },
  });
}