// src/app/api/wm/[slug]/route.ts
import { NextResponse } from "next/server";
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


function getContainerClient(log?: (...args: any[]) => void) {
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
    return service.getContainerClient(CONTAINER);
  }

  if (conn) {
    // Fall back to connection string
    // (Optional) try to extract account name for logging
    const acctMatch = conn.match(/AccountName=([^;]+)/i);
    log?.("auth", { mode: "conn-string", account: acctMatch?.[1] ?? undefined });
    const service = BlobServiceClient.fromConnectionString(conn);
    return service.getContainerClient(CONTAINER);
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
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
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
    const { slug } = await ctx.params;

    log("slug", slug);


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

    const container = getContainerClient(log);
    const blobClient = container.getBlockBlobClient(sourcePath);
    log("downloading", { blob: sourcePath });
    const dl = await blobClient.download();
    const input = await streamToBuffer(dl.readableStreamBody!);
    log("blob downloaded", { contentLength: dl.contentLength, bufLen: input.length });

    // 画像を読み、回転補正＋透かし合成＋再圧縮
    const img = sharp(input).rotate();
    const meta = await img.metadata();
    log("image metadata (pre)", { width: meta.width, height: meta.height, format: meta.format, hasProfile: Boolean(meta.icc) });
    const { width = 0, height = 0 } = meta;
    const { svgBuffer: wm, svgWidth: wmWidth, svgHeight: wmHeight } = svgWatermark(WM_TEXT, width || 0);
    log("wm computed", { text: WM_TEXT, wmWidth, wmHeight });

    // 透かしの配置：右下にマージンをとって合成
    // SVG は (0,0) 起点なので、gravity ではなく position 指定で置く
    const left = Math.max(0, (width || 0) - wmWidth - _MARGIN);
    const top = Math.max(0, (height || 0) - wmHeight - _MARGIN);
    log("placement", { width, height, left, top, margin: _MARGIN });

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

    log("responding image/jpeg");

    return new NextResponse(u8 as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        // ブラウザ & CDN キャッシュ（お好みで調整）
        "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e: any) {
    console.error("wm error:", e?.message || e);
    // Emit a compact diagnostic into response when debug=1 (non-binary)
    if (typeof url !== "undefined" && (url.searchParams.get(DEBUG_QUERY_KEY) === "1" || url.searchParams.get(DEBUG_QUERY_KEY) === "true")) {
      return NextResponse.json({ error: "wm-failed", msg: String(e?.message || e) }, { status: 500 });
    }
    return NextResponse.json({ error: "wm-failed" }, { status: 500 });
  }
}