import { BlobServiceClient } from "@azure/storage-blob";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const blogImageLimiter = createRateLimiter({ prefix: "blog:image", limit: 120, windowMs: 60_000 });

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

function checkHostOrigin(req: Request) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return new Response(JSON.stringify({ error: "forbidden host" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return null;
}

const CONTAINER = process.env.AZURE_BLOG_CONTAINER || "blog";

function sanitizePath(parts: string[]) {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  if (parts.length > 5) return null; // limit depth
  for (const p of parts) {
    if (!p || p === "." || p === ".." || p.includes("\\")) return null;
  }
  return parts.join("/");
}

function getBlobService() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("missing AZURE_STORAGE_CONNECTION_STRING");
  return BlobServiceClient.fromConnectionString(conn);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const bad = checkHostOrigin(req);
    if (bad) return bad;

    const ip = clientIp(req);
    const { ok, resetSec } = await blogImageLimiter.hit(ip);
    if (!ok) {
      const r = new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
      r.headers.set("Retry-After", String(resetSec));
      return r;
    }

    const { path } = await params;
    const key = sanitizePath(path);
    if (!key) {
      return new Response(JSON.stringify({ error: "bad path" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const service = getBlobService();
    const container = service.getContainerClient(CONTAINER);
    const blob = container.getBlockBlobClient(key);

    const exists = await blob.exists();
    if (!exists) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const props = await blob.getProperties();
    const contentType =
      props.contentType ||
      (key.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");

    // ★ ストリーミングで返す（型エラー回避 & メモリ効率◎）
    const dl = await blob.download();
    const stream = dl.readableStreamBody!;
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}