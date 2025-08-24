// src/app/api/wm/[slug]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient } from "@azure/storage-blob";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return Buffer.from(
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
}

function blobClientFromConn(conn: string) {
  const service = BlobServiceClient.fromConnectionString(conn);
  return service.getContainerClient(CONTAINER);
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
  try {
    const { slug } = await ctx.params;

    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!conn) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });

    // DB から対象写真と large 版のパスを取る
    const photo = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true },
    });
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const large = photo.variants.find((v) => v.type === "large");
    const sourcePath = (large?.storagePath ?? photo.storagePath); // large 無ければオリジナル

    const container = blobClientFromConn(conn);
    const blobClient = container.getBlockBlobClient(sourcePath);
    const dl = await blobClient.download();
    const input = await streamToBuffer(dl.readableStreamBody!);

    // 画像を読み、回転補正＋透かし合成＋再圧縮
    const img = sharp(input).rotate();
    const { width = 0 } = await img.metadata();
    const wm = svgWatermark(WM_TEXT, width || 0);

    // 透かしの配置：右下にマージンをとって合成
    // SVG は (0,0) 起点なので、gravity ではなく position 指定で置く
    const gravity = _WM_PLACEMENT === "bottom-right" ? "southeast" : "centre";
    const composed = await img
      .composite([
        {
          input: wm,
          gravity
        },
      ])
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();

    return new NextResponse(composed, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        // ブラウザ & CDN キャッシュ（お好みで調整）
        "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e: any) {
    console.error("wm error:", e);
    return NextResponse.json({ error: "wm-failed" }, { status: 500 });
  }
}