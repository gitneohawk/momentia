import { NextResponse, type NextRequest } from "next/server";
import { getBlobServiceClient } from "@/lib/azure-storage";
import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/photographers/image" });

const imageLimiter = createRateLimiter({
  prefix: "photographers:image",
  limit: 120,
  windowMs: 60_000,
});

const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const CONTAINER = process.env.AZURE_PHOTOS_CONTAINER || "photos";

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

function checkHostOrigin(req: Request): Response | null {
  const referer = req.headers.get("referer") || "";
  if (referer.includes("/_next/image")) {
    return null;
  }

  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return new Response(JSON.stringify({ error: "forbidden host" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return null;
}

function sanitizePath(parts: string[]): string | null {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 6) return null;
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.includes("\\")) return null;
  }
  return parts.join("/");
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const badOrigin = checkHostOrigin(req);
    if (badOrigin) {
      return badOrigin;
    }

    const ip = clientIp(req);
    const { ok, resetSec } = await imageLimiter.hit(ip);
    if (!ok) {
      const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
      r.headers.set("Retry-After", String(resetSec));
      return r;
    }

    const { path } = await context.params;
    const key = sanitizePath(path);
    if (!key) {
      return NextResponse.json({ error: "bad path" }, { status: 400 });
    }

    const client = getBlobServiceClient();
    const container = client.getContainerClient(CONTAINER);
    const blob = container.getBlockBlobClient(key);

    const exists = await blob.exists();
    if (!exists) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const props = await blob.getProperties();
    const contentType =
      props.contentType ||
      (key.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");

    const download = await blob.download();
    const stream = download.readableStreamBody;
    if (!stream) {
      return NextResponse.json({ error: "download failed" }, { status: 500 });
    }

    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch (e: any) {
    log.error("Photographer image handler failed", { err: serializeError(e) });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
