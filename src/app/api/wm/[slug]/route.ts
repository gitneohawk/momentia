// src/app/api/wm/[slug]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Debug switch: enable by calling /api/wm/[slug]?debug=1
const DEBUG_QUERY_KEY = "debug";

const CONTAINER = "photos";
const QUALITY = 85;          // 出力JPEG品質
const _MARGIN = 24;           // 端からの余白(px)
const WM_TEXT = "© Evoluzio Inc. — Preview"; // 透かし文言
const _WM_PLACEMENT: "center" | "bottom-right" = "center";

const WM_CONTAINER = "wm"; // 透かし済み画像を保存する専用コンテナ
const WM_MAX_EDGE = 2048;  // 透かし出力の長辺
const WM_VERSION = "v1";   // 将来の画質・レイアウト変更時のキャッシュ破棄用
const FORCE_QUERY_KEY = "generate"; // /api/wm/[slug]?generate=1 で強制生成

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


function getContainerClient(containerName: string, log?: (...args: any[]) => void) {
  const account =
    process.env.AZURE_STORAGE_ACCOUNT ||
    process.env.STORAGE_ACCOUNT_NAME ||
    process.env.NEXT_PUBLIC_STORAGE_ACCOUNT;

  // Detect if Managed Identity is available in the container environment
  // (ACA/Functions/VMs expose one or more of these variables when MSI is enabled)
  const msiAvailable = Boolean(
    process.env.IDENTITY_ENDPOINT ||
    process.env.MSI_ENDPOINT ||
    process.env.AZURE_CLIENT_ID
  );

  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";

  // Prefer Managed Identity when available (more robust than conn strings, which may rotate)
  if (msiAvailable && account) {
    log?.("auth", { mode: "managed-identity", account });
    const url = `https://${account}.blob.core.windows.net`;
    const credential = new DefaultAzureCredential();
    const service = new BlobServiceClient(url, credential);
    return service.getContainerClient(containerName);
  }

  if (conn) {
    // Fall back to connection string
    // (Optional) try to extract account name for logging
    const acctMatch = conn.match(/AccountName=([^;]+)/i);
    log?.("auth", { mode: "conn-string", account: acctMatch?.[1] ?? undefined });
    const service = BlobServiceClient.fromConnectionString(conn);
    return service.getContainerClient(containerName);
  }

  // If we reach here, we don't have enough info
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
  _req: NextRequest,
  ctx: any
) {
  const { params } = ctx as { params: { slug: string } };
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
    const { slug } = params;

    log("slug", slug);

    const forceGenerate = url.searchParams.get(FORCE_QUERY_KEY) === "1" || url.searchParams.get(FORCE_QUERY_KEY) === "true";
    const wmFileName = `${slug}_wm_${WM_MAX_EDGE}_${WM_VERSION}.jpg`;
    const wmPath = `/${wmFileName}`.replace(/^\/+/, ""); // フラット配置（必要なら階層化に変更可）

    const account =
      process.env.AZURE_STORAGE_ACCOUNT ||
      process.env.STORAGE_ACCOUNT_NAME ||
      process.env.NEXT_PUBLIC_STORAGE_ACCOUNT ||
      "";
    if (!account) throw new Error("Missing storage account name for public URL computation");

    // Prefer explicit override for local/dev (e.g., Azurite): AZURE_BLOB_PUBLIC_BASE
    // Example: http://localhost:10000/devstoreaccount1
    const envPublicBase = process.env.AZURE_BLOB_PUBLIC_BASE?.trim();
    let publicBase = envPublicBase && envPublicBase.length > 0 ? envPublicBase : `https://${account}.blob.core.windows.net`;

    // If using Azurite (devstoreaccount1 or UseDevelopmentStorage), fall back to a sane default if not explicitly set
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING || "";
    const isDevstore = account === "devstoreaccount1" || /UseDevelopmentStorage=true/i.test(connStr) || /AccountName=devstoreaccount1/i.test(connStr);
    if (!envPublicBase && isDevstore) {
      const host = process.env.AZURITE_PUBLIC_HOST || "localhost"; // set AZURITE_PUBLIC_HOST to your mapped host if not localhost
      const port = process.env.AZURITE_BLOB_PUBLIC_PORT || "10000";
      publicBase = `http://${host}:${port}/${account}`;
    }

    // DB から対象写真と large 版のパスを取る
    const photo = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true },
    });
    log("photo found?", Boolean(photo), photo ? { id: photo.id, storagePath: photo.storagePath, variants: photo.variants?.map(v => ({ type: v.type, path: v.storagePath })) } : {});
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const large = photo.variants.find((v) => v.type === "large");
    const sourcePath = (large?.storagePath ?? photo.storagePath); // large 無ければオリジナル
    log("sourcePath", sourcePath, "chosenVariant", large ? "large" : "original");

    const wmContainer = getContainerClient(WM_CONTAINER, log);
    try {
      await wmContainer.createIfNotExists();
    } catch (e) {
      log("wm container createIfNotExists error (non-fatal)", String((e as any)?.message || e));
    }
    const wmBlob = wmContainer.getBlockBlobClient(wmPath);
    let exists = false;
    try {
      exists = await wmBlob.exists();
    } catch (ex: any) {
      // Azurite may respond 400 OutOfRangeInput for HEAD on non-existing container/blob
      log("wm exists() error treated as not-exists", String(ex?.message || ex));
      exists = false;
    }
    log("wm exists?", exists, { container: WM_CONTAINER, path: wmPath });

    if (exists && !forceGenerate) {
      const target = `${publicBase}/${WM_CONTAINER}/${wmPath}`;
      log("redirecting to existing WM", target);
      return NextResponse.redirect(target, { status: 302 });
    }

    const container = getContainerClient(CONTAINER, log);
    const blobClient = container.getBlockBlobClient(sourcePath);
    log("downloading", { blob: sourcePath });
    const dl = await blobClient.download();
    if (!dl.readableStreamBody) throw new Error("Blob stream is empty");
    const input = await streamToBuffer(dl.readableStreamBody);
    log("blob downloaded", { contentLength: dl.contentLength, bufLen: input.length });

    // 画像を読み、回転補正＋リサイズ＋透かし合成＋再圧縮
    const img = sharp(input).rotate().resize({ width: WM_MAX_EDGE, height: WM_MAX_EDGE, fit: "inside", withoutEnlargement: true });
    const meta = await img.metadata();
    log("image metadata (pre)", { width: meta.width, height: meta.height, format: meta.format, hasProfile: Boolean(meta.icc) });
    const { width = 0, height = 0 } = meta;
    const { svgBuffer: wm, svgWidth: wmWidth, svgHeight: wmHeight } = svgWatermark(WM_TEXT, width || 0);
    log("wm computed", { text: WM_TEXT, wmWidth, wmHeight });

    // 透かしの配置：センター or 右下
    let left: number, top: number;

    if (_WM_PLACEMENT === "center") {
      // 画像中心に配置（はみ出し防止で 0 を下限）
      left = Math.max(0, Math.round(((width || 0) - wmWidth) / 2));
      top  = Math.max(0, Math.round(((height || 0) - wmHeight) / 2));
    } else {
      // 右下にマージンを取って配置
      left = Math.max(0, (width || 0) - wmWidth - _MARGIN);
      top  = Math.max(0, (height || 0) - wmHeight - _MARGIN);
    }

    log("placement", {
      mode: _WM_PLACEMENT,
      width, height, left, top, margin: _MARGIN
    });

    const composed = await img
      .composite([
        {
          input: wm,
          left,
          top,
        },
      ])
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    log("composed buffer", { bytes: composed.length });

    // Convert Node.js Buffer to a Uint8Array (BodyInit compatible for NextResponse)
    const u8 = new Uint8Array(
      composed.buffer,
      composed.byteOffset,
      composed.byteLength
    );

    // 生成結果をWMコンテナへアップロード（冪等）
    try {
      await wmBlob.uploadData(u8, {
        blobHTTPHeaders: {
          blobContentType: "image/jpeg",
          // ブラウザ・CDNに長期キャッシュさせる（将来はWM_VERSIONを更新してバスティング）
          blobCacheControl: "public, max-age=31536000, immutable",
        },
      });
      log("wm uploaded", { container: WM_CONTAINER, path: wmPath, bytes: u8.byteLength });
    } catch (upErr: any) {
      // 既存がある等で失敗しても致命ではないためログのみ
      log("wm upload error (non-fatal)", String(upErr?.message || upErr));
    }

    const target = `${publicBase}/${WM_CONTAINER}/${wmPath}`;
    log("redirecting to new WM", target);

    if (debug) {
      // In debug mode, return the image directly for inspection
      return new NextResponse(u8 as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          // ブラウザ & CDN キャッシュ（お好みで調整）
          "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    }

    return NextResponse.redirect(target, { status: 302 });
  } catch (e: any) {
    console.error("wm error:", e?.message || e);
    // Emit a compact diagnostic into response when debug=1 (non-binary)
    if (typeof url !== "undefined" && (url.searchParams.get(DEBUG_QUERY_KEY) === "1" || url.searchParams.get(DEBUG_QUERY_KEY) === "true")) {
      return NextResponse.json({ error: "wm-failed", msg: String(e?.message || e) }, { status: 500 });
    }
    return NextResponse.json({ error: "wm-failed" }, { status: 500 });
  }
}