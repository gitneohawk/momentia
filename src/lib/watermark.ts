import sharp from "sharp";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

const ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT || "momentiastorage";
const PHOTOS_CONTAINER = "photos";
const WATERMARKS_CONTAINER = process.env.AZURE_BLOB_WATERMARKS_CONTAINER || "watermarks";
const PUB_PREFIX = "public/";

function makeBlobServiceFromEnv(): BlobServiceClient {
  if (process.env.AZURE_USE_MSI === "1") {
    const endpoint = `https://${ACCOUNT_NAME}.blob.core.windows.net`;
    const cred = new DefaultAzureCredential();
    return new BlobServiceClient(endpoint, cred, { retryOptions: { maxTries: 3 } });
  }
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("missing storage connection");
  // BlobEndpoint 付き（Azurite含む）はSDKにパースさせる
  if (/(^|;)BlobEndpoint=/i.test(conn)) {
    return BlobServiceClient.fromConnectionString(conn, { retryOptions: { maxTries: 3 } });
  }
  // それ以外は手組み
  const kv = new Map(
    conn.split(";").map(s => {
      const i = s.indexOf("="); return i >= 0 ? [s.slice(0, i), s.slice(i + 1)] : ["", ""];
    })
  );
  const accountName = kv.get("AccountName");
  const accountKey = kv.get("AccountKey");
  const endpointSuffix = kv.get("EndpointSuffix") || "core.windows.net";
  const protocol = kv.get("DefaultEndpointsProtocol") || "https";
  if (!accountName || !accountKey) throw new Error("invalid storage conn");
  const endpoint = `${protocol}://${accountName}.blob.${endpointSuffix}`;
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  return new BlobServiceClient(endpoint, cred, { retryOptions: { maxTries: 3 } });
}

export type GenerateWatermarkOptions = {
  slug: string;
  width?: number;     // default 2048
  text?: string;      // 透かし文字（省略時は既定）
  overwrite?: boolean; // 既存があっても再生成するなら true
};

export async function generateWatermark(opts: GenerateWatermarkOptions): Promise<{ blobName: string }> {
  const width = opts.width ?? 2048;
  const text  = opts.text ?? "© Evoluzio Inc. — Preview";

  const service = makeBlobServiceFromEnv();
  const photos = service.getContainerClient(PHOTOS_CONTAINER);
  const wms    = service.getContainerClient(WATERMARKS_CONTAINER);

  await wms.createIfNotExists(); // 409 ok

  const baseName = `${opts.slug}_2048.jpg`;
  const srcBlob  = photos.getBlockBlobClient(`${PUB_PREFIX}${baseName}`);

  // ソースの存在チェック
  if (!(await srcBlob.exists())) {
    throw new Error(`source image not found: ${PUB_PREFIX}${baseName}`);
  }
  const outName = `${opts.slug}_wm_${width}_v1.jpg`;
  const outBlob = wms.getBlockBlobClient(outName);

  // 既存WMがあればスキップ（overwriteで上書き可）
  if (!opts.overwrite && (await outBlob.exists())) {
    return { blobName: outName };
  }

  // ダウンロード → 合成
  const dl = await srcBlob.download();
  const srcBuf = Buffer.from(await streamToBuffer(dl.readableStreamBody));

  const image = sharp(srcBuf).withMetadata();
  const meta  = await image.metadata();
  const targetW = Math.min(width, meta.width || width);

  const wmSvg = makeWatermarkSvg(text, Math.round(targetW * 0.58)); // 横幅比率は適宜調整
  const composed = await sharp(srcBuf)
    .resize({ width: targetW, withoutEnlargement: true })
    .composite([{ input: Buffer.from(wmSvg), gravity: "center" }])
    .jpeg({ quality: 88 })
    .toBuffer();

  await outBlob.uploadData(composed, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });
  return { blobName: outName };
}

function makeWatermarkSvg(text: string, width: number) {
  const fontSize = Math.max(24, Math.round(width / 16));
  const padding  = Math.round(fontSize * 0.6);
  const fill = "rgba(255,255,255,0.76)";
  const stroke = "rgba(0,0,0,0.35)";
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${fontSize + padding*2}">
    <style>
      .t { font: ${fontSize}px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    </style>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
          class="t" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(1, Math.round(fontSize/12))}">
      ${escapeXml(text)}
    </text>
  </svg>`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, c => ({ "<":"&lt;","&": "&amp;",">":"&gt;","'":"&apos;","\"":"&quot;" }[c]!));
}

async function streamToBuffer(stream?: NodeJS.ReadableStream | null) {
  if (!stream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const ch of stream) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
  return Buffer.concat(chunks);
}