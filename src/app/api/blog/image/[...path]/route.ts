import { NextResponse, type NextRequest } from "next/server";
import { blobServiceClient } from "@/lib/azure-storage";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- ヘルパー関数 ---
const blogImageLimiter = createRateLimiter({ prefix: "blog:image", limit: 120, windowMs: 60_000 });
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const CONTAINER = process.env.AZURE_BLOG_CONTAINER || "blog";

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}
function checkHostOrigin(req: Request): Response | null {
  const referer = req.headers.get("referer") || "";
  if (referer.includes("/_next/image")) { return null; }
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return new Response(JSON.stringify({ error: "forbidden host" }), {
      status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return null;
}
function sanitizePath(parts: string[]): string | null {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 5) return null;
  for (const p of parts) { if (!p || p === "." || p === ".." || p.includes("\\")) return null; }
  return parts.join("/");
}

// --- メインのGETハンドラ ---
export async function GET(
  // ★★★ これが最後の修正点 ★★★
  // 問題の2番目の引数を完全に削除
  req: NextRequest
) {
  try {
    const badOrigin = checkHostOrigin(req);
    if (badOrigin) {
      return badOrigin;
    }

    const ip = clientIp(req);
    const { ok, resetSec } = await blogImageLimiter.hit(ip);
    if (!ok) {
      const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
      r.headers.set("Retry-After", String(resetSec));
      return r;
    }

    // ★★★ reqオブジェクトからURLパスを手動で解析 ★★★
    const pathname = req.nextUrl.pathname;
    const basePath = "/api/blog/image/";
    if (!pathname.startsWith(basePath)) {
      return NextResponse.json({ error: "Invalid route" }, { status: 400 });
    }
    const path = pathname.substring(basePath.length).split('/');

    const key = sanitizePath(path);
    if (!key) {
      return NextResponse.json({ error: "bad path" }, { status: 400 });
    }

    const containerClient = blobServiceClient.getContainerClient(CONTAINER);
    const blobClient = containerClient.getBlockBlobClient(key);

    const exists = await blobClient.exists();
    if (!exists) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const properties = await blobClient.getProperties();
    const contentType = properties.contentType || (key.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");

    const downloadResponse = await blobClient.download();
    const stream = downloadResponse.readableStreamBody!;
    
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });

  } catch (e: any) {
    console.error("[/api/blog/image] Critical error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}