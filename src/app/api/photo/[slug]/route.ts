import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { createSasGenerator } from "@/lib/azure-storage"; // ★ 共通のSAS生成関数をインポート

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  // (この関数の内容は変更なし)
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
  { params }: { params: { slug: string } } // ★ GETハンドラの引数を最新の書き方に修正
) {
  try {
    const { slug } = params;
    if (!validateSlug(slug)) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
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
      where: { slug, published: true }, // published: true を条件に追加
      include: { variants: true, keywords: true },
    });

    if (!photo) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // ★ 共通のSAS生成関数を呼び出す
    const getSignedUrl = createSasGenerator();
    const thumb = photo.variants.find(v => v.type === "thumb");
    const large = photo.variants.find(v => v.type === "large");

    const responseData = {
      slug: photo.slug,
      width: photo.width,
      height: photo.height,
      caption: photo.caption,
      keywords: photo.keywords.map(k => k.word),
      priceDigitalJPY: photo.priceDigitalJPY ?? 11000,
      pricePrintA2JPY: photo.pricePrintA2JPY ?? 55000,
      sellDigital: photo.sellDigital ?? true,
      sellPanel: photo.sellPanel ?? true,
      urls: {
        // ★ 安全な getSignedUrl を使用
        original: await getSignedUrl(photo.storagePath, "photos"),
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
    console.error("[/api/photo/slug] Critical error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}