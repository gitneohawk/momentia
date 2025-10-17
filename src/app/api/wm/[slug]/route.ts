import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { blobServiceClient } from "@/lib/azure-storage";
import sharp from "sharp";
import crypto from "crypto";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- 定数 & セキュリティ設定 ---
const wmLimiter = createRateLimiter({ prefix: "wm", limit: 120, windowMs: 60_000 });
const PHOTO_CONTAINER = "photos";
const WM_CONTAINER = process.env.AZURE_BLOB_WATERMARKS_CONTAINER || "watermarks";
const QUALITY = 85;
const WM_TEXT = "© Evoluzio Inc. — Preview";
const DEBUG_QUERY_KEY = "debug";

// --- ヘルパー関数 ---
function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

// ★★★ 最後の修正点 ★★★
// validateSlugStrict関数を元の安全な実装に戻す
function validateSlugStrict(s: string): boolean {
  if (!s || s.length > 100) {
    return false;
  }
  // 正規表現も、元のファイルにあったバックスラッシュのエスケープが不要なため修正
  return /^[a-z0-9-]+$/.test(s);
}

const VALID_WIDTHS = [512, 1024, 1536, 2048, 3072, 4096] as const;
function coerceWidth(n: number): number {
  const clamped = Math.max(320, Math.min(4096, Math.floor(n || 0)));
  for (const w of VALID_WIDTHS) { if (clamped <= w) return w; }
  return VALID_WIDTHS[VALID_WIDTHS.length - 1];
}
function svgWatermark(text: string, imgWidth: number) {
  const fontSize = Math.max(18, Math.min(48, Math.round(imgWidth * 0.035)));
  const svgWidth = Math.max(600, Math.min(1200, Math.round(imgWidth * 0.6)));
  const svgHeight = Math.round(fontSize * 1.6);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}"><style>.wm{font:${fontSize}px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;fill:rgba(255,255,255,0.88);paint-order:stroke;stroke:rgba(0,0,0,0.35);stroke-width:2;dominant-baseline:middle;text-anchor:middle;}</style><text x="50%" y="50%" class="wm">${text}</text></svg>`
  );
}
function wmFileName(slug: string, width: number) { return `${slug}_wm_${width}_v1.jpg`; }
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// --- メインのGETハンドラ ---
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const url = req.nextUrl;
  const debugParam = url.searchParams.get(DEBUG_QUERY_KEY);
  const debug: boolean = debugParam === "1" || debugParam === "true";
  
  const log = (...args: any[]) => { if (debug) console.log("[wm]", ...args); };

  log("Request start", { path: url.pathname });

  try {
    const { ok, resetSec } = await wmLimiter.hit(clientIp(req));
    if (!ok) {
      const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
      r.headers.set("Retry-After", String(resetSec));
      return r;
    }

    const { slug } = params;
    if (!validateSlugStrict(slug)) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const photo = await prisma.photo.findUnique({ where: { slug }, include: { variants: true } });
    if (!photo) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const largeVariant = photo.variants.find((v) => v.type === "large");
    const sourcePath = largeVariant?.storagePath ?? photo.storagePath;

    const qWidth = parseInt(url.searchParams.get("w") ?? "2048", 10);
    const widthOut = coerceWidth(isNaN(qWidth) ? 2048 : qWidth);
    const outName = wmFileName(slug, widthOut);

    const wmContainerClient = blobServiceClient.getContainerClient(WM_CONTAINER);
    const outBlobClient = wmContainerClient.getBlockBlobClient(outName);
    
    // 1. キャッシュを確認
    const refresh = url.searchParams.get("refresh") === "1";
    if (!refresh) {
      try {
        const properties = await outBlobClient.getProperties();
        if (properties.contentLength) {
          log("Cache hit", { outName });
          const downloadResponse = await outBlobClient.download();
          const cachedBuffer = await streamToBuffer(downloadResponse.readableStreamBody!);
          return new NextResponse(new Uint8Array(cachedBuffer), {
            status: 200,
            headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" },
          });
        }
      } catch (e: any) {
        if (e.statusCode !== 404) log("Cache check error", e.message);
        log("Cache miss", { outName });
      }
    }

    // 2. ソース画像をダウンロード
    const photosContainerClient = blobServiceClient.getContainerClient(PHOTO_CONTAINER);
    const sourceBlobClient = photosContainerClient.getBlockBlobClient(sourcePath);
    const downloadResponse = await sourceBlobClient.download();
    const sourceBuffer = await streamToBuffer(downloadResponse.readableStreamBody!);
    log("Source downloaded", { path: sourcePath, bytes: sourceBuffer.length });
    
    // 3. ウォーターマーク付き画像を生成
    const image = sharp(sourceBuffer).rotate();
    const metadata = await image.metadata();
    const wmSvg = svgWatermark(WM_TEXT, metadata.width || widthOut);

    const composedBuffer = await image
      .resize({ width: widthOut, withoutEnlargement: true })
      .composite([{ input: wmSvg }])
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    log("Image composed with watermark", { bytes: composedBuffer.length });

    // 4. 生成した画像をキャッシュとしてアップロード
    await outBlobClient.uploadData(composedBuffer, {
      blobHTTPHeaders: { blobContentType: "image/jpeg", blobCacheControl: "public, max-age=31536000, immutable" },
    });
    log("Cache uploaded", { outName });

    // 5. 生成した画像をレスポンスとして返す
    return new NextResponse(new Uint8Array(composedBuffer), {
      status: 200,
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" },
    });

  } catch (e: any) {
    console.error("[wm] Critical error:", e);
    if (debug) {
      return NextResponse.json({ error: "wm-failed", message: String(e?.message || e), stack: e.stack }, { status: 500 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}