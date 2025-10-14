// src/app/api/wm/[slug]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import sharp from "sharp";
import crypto from "crypto";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- security: allowlist hosts & rate limit ---
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const wmLimiter = createRateLimiter({ prefix: "wm", limit: 120, windowMs: 60_000 });

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}
function checkHostOrigin(req: Request) {
  // Allow internal fetches via Next.js Image Optimization pipeline
  const ref = req.headers.get("referer") || "";
  if (ref.includes("/_next/image")) {
    return null as Response | null;
  }
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

// width buckets to improve cache hit ratio
const VALID_WIDTHS = [512, 1024, 1536, 2048, 3072, 4096] as const;
function coerceWidth(n: number): number {
  const clamped = Math.max(320, Math.min(4096, Math.floor(n || 0)));
  // pick the smallest bucket >= requested, else the largest
  for (const w of VALID_WIDTHS) {
    if (clamped <= w) return w;
  }
  return VALID_WIDTHS[VALID_WIDTHS.length - 1];
}

function validateSlugStrict(s: string): boolean {
  if (!s) return false;
  if (s.length > 100) return false;
  if (/[\\/]/.test(s)) return false;
  return /^[a-z0-9-]+$/.test(s);
}

// Debug switch: enable by calling /api/wm/[slug]?debug=1
const DEBUG_QUERY_KEY = "debug";

const PHOTO_CONTAINER = "photos";
// Azure Blob container name must be 3–63 lowercase letters/numbers/hyphens
const WM_CONTAINER = (() => {
  // Prefer AZURE_BLOB_WATERMARKS_CONTAINER (prod env), fallback to WM_CONTAINER (legacy), default "watermarks"
  const raw = process.env.AZURE_BLOB_WATERMARKS_CONTAINER || process.env.WM_CONTAINER || "watermarks";
  const v = raw.toLowerCase();
  return /^[a-z0-9-]{3,63}$/.test(v) ? v : "watermarks";
})();
const QUALITY = 85;          // 出力JPEG品質
const _MARGIN = 24;           // 端からの余白(px)
const WM_TEXT = "© Evoluzio Inc. — Preview"; // 透かし文言
const _WM_PLACEMENT: "center" | "bottom-right" = "center";

function svgWatermark(text: string, imgWidth: number) {
  // 半透明の白文字＋わずかな影（視認性重視）
  // `paint-order` でストローク→塗り順を固定
  const fontSize = Math.max(18, Math.min(48, Math.round(imgWidth * 0.035))); // 画像幅の3.5%目安（18–48の範囲）
  const svgWidth = Math.max(600, Math.min(1200, Math.round(imgWidth * 0.6)));
  const svgHeight = Math.round(fontSize * 1.6);
  const svgBuffer = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <style>
        .wm {
          font: ${fontSize}px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          fill: rgba(255,255,255,0.88);
          paint-order: stroke;
          stroke: rgba(0,0,0,0.35);
          stroke-width: 2;
          dominant-baseline: middle;
          text-anchor: middle;
        }
      </style>
      <text x="50%" y="50%" class="wm">${text}</text>
    </svg>`
  );
  return { svgBuffer, svgWidth, svgHeight };
}

// slug を安全化（非常に長い/スラッシュ含む等は短縮）
function safeSlug(slug: string) {
  const s = (slug || "").trim();
  if (!s || s.length > 100 || /[\\/]/.test(s)) {
    return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
  }
  return s;
}

function wmFileName(slug: string, width: number) {
  const short = safeSlug(slug);
  return `${short}_wm_${width}_v1.jpg`;
}

function thumbFileName(slug: string, width: number) {
  const short = safeSlug(slug);
  return `${short}_thumb_${width}.jpg`;
}

// storagePath がフルURL/コンテナ名付きの場合に Blob 名のみへ正規化
function normalizeSourceBlobPath(input: string): string {
  if (!input) return input;
  let p = input.trim().replace(/^\/+/, "");
  if (/^https?:\/\//i.test(p)) {
    try {
      const u = new URL(p);
      const path = u.pathname.replace(/^\/+/, ""); // container/blob...
      const parts = path.split("/");
      if (parts.length >= 2) p = parts.slice(1).join("/"); // drop container segment
      else p = path;
    } catch {
      // fall through with original p
    }
  }
  if (p.startsWith(`${PHOTO_CONTAINER}/`)) {
    p = p.slice(PHOTO_CONTAINER.length + 1); // "photos/public/..." -> "public/..."
  }
  if (!p.startsWith("public/")) {
    p = `public/${p}`; // force public/ prefix
  }
  return p;
}


function getBlobService(log?: (...args: any[]) => void) {
  const account =
    process.env.AZURE_STORAGE_ACCOUNT ||
    process.env.STORAGE_ACCOUNT_NAME ||
    process.env.NEXT_PUBLIC_STORAGE_ACCOUNT;

  const msiAvailable = Boolean(
    process.env.IDENTITY_ENDPOINT ||
    process.env.MSI_ENDPOINT ||
    process.env.AZURE_CLIENT_ID
  );

  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";

  if (msiAvailable && account) {
    log?.("auth", { mode: "managed-identity", account });
    const url = `https://${account}.blob.core.windows.net`;
    const credential = new DefaultAzureCredential();
    return new BlobServiceClient(url, credential);
  }
  if (conn) {
    const acctMatch = conn.match(/AccountName=([^;]+)/i);
    log?.("auth", { mode: "conn-string", account: acctMatch?.[1] ?? undefined });
    return BlobServiceClient.fromConnectionString(conn);
  }
  throw new Error(
    "Storage configuration missing. Provide either Managed Identity + AZURE_STORAGE_ACCOUNT (or STORAGE_ACCOUNT_NAME / NEXT_PUBLIC_STORAGE_ACCOUNT), or AZURE_STORAGE_CONNECTION_STRING."
  );
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function GET(
  _req: Request,
  // Next.js injects context at runtime; relax typing to avoid mismatch across versions
  context: any
) {
  // Parse debug flag from query string
  const url = new URL(_req.url);
  const debug = url.searchParams.get(DEBUG_QUERY_KEY) === "1" || url.searchParams.get(DEBUG_QUERY_KEY) === "true";

  const log = (...args: any[]) => {
    if (debug) {
      // Prefix to make grepping logs easier
      console.log("[wm]", ...args);
    }
  };

  log("request start", { url: url.pathname + url.search });

  try {
    // --- security preflight: host/origin, rate limit ---
    const bad = checkHostOrigin(_req);
    if (bad) return bad;
    {
      const { ok, resetSec } = await wmLimiter.hit(clientIp(_req));
      if (!ok) {
        const r = NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
        r.headers.set("Retry-After", String(resetSec));
        return r;
      }
    }

    const { slug } = context.params as { slug: string };
    if (!validateSlugStrict(slug)) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    log("slug", slug);

    // DB から対象写真と large 版のパスを取る
    const photo = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true },
    });
    log("photo found?", Boolean(photo), photo ? { id: photo.id, storagePath: photo.storagePath, variants: photo.variants?.map(v => ({ type: v.type, path: v.storagePath })) } : {});
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

    const large = photo.variants.find((v) => v.type === "large");
    const sourcePath = (large?.storagePath ?? photo.storagePath); // large 無ければオリジナル
    log("sourcePath", sourcePath, "chosenVariant", large ? "large" : "original");

    const qWidth = parseInt(url.searchParams.get("w") ?? "2048", 10);
    const widthOut = coerceWidth(isNaN(qWidth) ? 2048 : qWidth);
    const noWm = url.searchParams.get("nowm") === "1" || url.searchParams.get("wm") === "0";
    const refresh = url.searchParams.get("refresh") === "1";
    const _generate = url.searchParams.get("generate") === "1"; // 生成を強制（未使用でもtrueで同じ）

    const service = getBlobService(log);
    const photos = service.getContainerClient(PHOTO_CONTAINER);
    const wm = service.getContainerClient(WM_CONTAINER);
    await wm.createIfNotExists(); // 409 OK

    let normPath = normalizeSourceBlobPath(sourcePath);
    let srcBlob = photos.getBlockBlobClient(normPath);
    log("downloading", { blob: normPath });
    let dl;
    try {
      dl = await srcBlob.download();
    } catch (e: any) {
      // Fallback to canonical large name (public/<slug>_2048.jpg) for older records or missing variant paths
      const fallback = `public/${slug}_2048.jpg`;
      if (fallback !== normPath) {
        log("source-miss-fallback", { from: normPath, to: fallback });
        normPath = fallback;
        srcBlob = photos.getBlockBlobClient(normPath);
        dl = await srcBlob.download();
      } else {
        throw e;
      }
    }
    const input = await streamToBuffer(dl.readableStreamBody!);
    log("blob downloaded", { contentLength: dl.contentLength, bufLen: input.length });

    // 画像を読み、回転補正＋透かし合成＋再圧縮
    const img = sharp(input).rotate();
    const meta = await img.metadata();
    log("image metadata (pre)", { width: meta.width, height: meta.height, format: meta.format, hasProfile: Boolean(meta.icc) });

    const outName = noWm ? thumbFileName(slug, widthOut) : wmFileName(slug, widthOut);
    const outBlob = wm.getBlockBlobClient(outName);

    if (!refresh) {
      try {
        const head = await outBlob.getProperties();
        if (head?.contentLength && head.contentLength > 0) {
          const dl2 = await outBlob.download();
          const buf = await streamToBuffer(dl2.readableStreamBody!);
          log("cache-hit", { outName, bytes: buf.length, noWm });
          return new NextResponse(new Uint8Array(buf) as BodyInit, {
            status: 200,
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
            },
          });
        }
      } catch {
        log("cache-miss", outName);
      }
    }

    let composed: Buffer;
    if (noWm) {
      composed = await sharp(input)
        .rotate()
        .resize({ width: widthOut, withoutEnlargement: true })
        .jpeg({ quality: Math.min(QUALITY, 82), mozjpeg: true })
        .toBuffer();
      log("composed-nowm", { widthOut, bytes: composed.length });
    } else {
      const { width = 0, height = 0 } = meta;
      const { svgBuffer: wmBuf, svgWidth: wmWidth, svgHeight: wmHeight } = svgWatermark(WM_TEXT, width || widthOut);
      let left: number, top: number;
      if (_WM_PLACEMENT === "center") {
        left = Math.max(0, Math.round(((width || widthOut) - wmWidth) / 2));
        top = Math.max(0, Math.round(((height || Math.round(widthOut * 0.66)) - wmHeight) / 2));
      } else {
        left = Math.max(0, (width || widthOut) - wmWidth - _MARGIN);
        top = Math.max(0, (height || Math.round(widthOut * 0.66)) - wmHeight - _MARGIN);
      }
      log("placement", { mode: _WM_PLACEMENT, width, height, left, top, margin: _MARGIN });
      composed = await sharp(input)
        .rotate()
        .resize({ width: widthOut, withoutEnlargement: true })
        .composite([{ input: wmBuf, left, top }])
        .jpeg({ quality: QUALITY, mozjpeg: true })
        .toBuffer();
      log("composed-wm", { widthOut, bytes: composed.length });
    }

    try {
      await outBlob.uploadData(composed, {
        blobHTTPHeaders: {
          blobContentType: "image/jpeg",
          blobCacheControl: "public, max-age=31536000, immutable",
        },
      });
      log("out-uploaded", { outName, bytes: composed.length, noWm });
    } catch (e: any) {
      log("out-upload-error", String(e?.message || e));
    }

    const u8 = new Uint8Array(composed.buffer, composed.byteOffset, composed.byteLength);
    return new NextResponse(u8 as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e: any) {
    console.error("wm error:", e?.message || e);
    // Emit a compact diagnostic into response when debug=1 (non-binary)
    if (typeof url !== "undefined" && (url.searchParams.get(DEBUG_QUERY_KEY) === "1" || url.searchParams.get(DEBUG_QUERY_KEY) === "true")) {
      return NextResponse.json({ error: "wm-failed", msg: String(e?.message || e) }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "wm-failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}