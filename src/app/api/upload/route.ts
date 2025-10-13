import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

import sharp from "sharp";
import * as exifr from "exifr";
import { generateWatermark } from "@/lib/watermark";

export const runtime = "nodejs";       // sharp を使うため Node 実行
export const dynamic = "force-dynamic"; // 開発中はキャッシュ無効でOK

const CONTAINER_NAME = "photos";
const ORIG_PREFIX = "originals/";
const PUB_PREFIX = "public/";
const ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT || "momentiastorage";

// --- helpers (env / logging) ---
const isProd = process.env.NODE_ENV === "production";
const info = (...args: any[]) => { if (!isProd) console.info(...args); };
const warn = (...args: any[]) => console.warn(...args);

function parseConnString(raw: string) {
  const s = raw.trim().replace(/^\s*['"]|['"]\s*$/g, ""); // strip quotes/whitespace
  const entries = s
    .split(";")
    .map((kv): [string, string] | null => {
      const idx = kv.indexOf("=");
      if (idx === -1) return null;
      const key = kv.slice(0, idx).trim();
      const val = kv.slice(idx + 1).trim();
      return key && val ? [key, val] : null;
    })
    .filter((e): e is [string, string] => !!e);

  const map = new Map<string, string>(entries);

  const accountName = map.get("AccountName");
  const accountKey  = map.get("AccountKey");
  const blobEndpoint = map.get("BlobEndpoint");

  if (!accountName || !accountKey) {
    throw new Error("Invalid storage connection string (missing AccountName/AccountKey)");
  }

  // If an explicit BlobEndpoint is provided (e.g., Azurite: http://host.docker.internal:10000/devstoreaccount1), use it.
  if (blobEndpoint && blobEndpoint.length > 0) {
    return { accountName, accountKey, endpoint: blobEndpoint };
  }

  // Fallback to public Azure endpoint
  const protocol    = map.get("DefaultEndpointsProtocol") || "https";
  const endpointSuffix = map.get("EndpointSuffix") || "core.windows.net";
  const endpoint = `${protocol}://${accountName}.blob.${endpointSuffix}`;
  return { accountName, accountKey, endpoint };
}

function makeBlobService(rawConn: string) {
  // If the connection string specifies BlobEndpoint (e.g., Azurite), let the SDK parse & honor it.
  if (/(^|;)BlobEndpoint=/i.test(rawConn)) {
    return BlobServiceClient.fromConnectionString(rawConn, {
      retryOptions: { maxTries: 3 },
    });
  }
  // Otherwise, build endpoint from parts.
  const { accountName, accountKey, endpoint } = parseConnString(rawConn);
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  return new BlobServiceClient(endpoint, cred, {
    retryOptions: { maxTries: 3 },
  });
}

function makeBlobServiceWithMsi() {
  const endpoint = `https://${ACCOUNT_NAME}.blob.core.windows.net`;
  const cred = new DefaultAzureCredential();
  return new BlobServiceClient(endpoint, cred, { retryOptions: { maxTries: 3 } });
}

function getBlobService() {
  // Prefer MSI when explicitly enabled
  if (process.env.AZURE_USE_MSI === "1") {
    const endpoint = `https://${ACCOUNT_NAME}.blob.core.windows.net`;
    console.log("[storage] mode=msi endpoint=", endpoint);
    return makeBlobServiceWithMsi();
  }
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new Error("missing storage connection");
  }
  console.log(
    "[storage]",
    conn.includes("devstoreaccount1") ? "azurite" : conn.split(";").slice(0, 2).join(";")
  );
  return makeBlobService(conn);
}

async function ensureContainer() {
  const service = getBlobService();
  const container = service.getContainerClient(CONTAINER_NAME);
  await container.createIfNotExists(); // 409はOK
  return container;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const wantWm = (form.get("wm") === "1" || form.get("wm") === "true");
    const publishNow = (form.get("publish") === "1" || form.get("publish") === "true");
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const arrayBuffer = await (file as File).arrayBuffer();
    const src = Buffer.from(arrayBuffer);

    let container;
    try {
      container = await ensureContainer();
    } catch (err: any) {
      console.error("[storage] init error:", err?.message || err);
      return NextResponse.json({ error: "storage init failed" }, { status: 500 });
    }

    const base = (file as File).name.replace(/\.[^.]+$/, "");
    const slug = slugify(base);

    const img = sharp(src).withMetadata();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return NextResponse.json({ error: "invalid image" }, { status: 400 });

    const exifData: any = await (exifr as any).parse(src).catch(() => null);

    // originals
    const originalJpeg = await img.jpeg({ quality: 92 }).toBuffer();
    const originalPath = `${ORIG_PREFIX}${slug}.jpg`;
    await container
      .getBlockBlobClient(originalPath)
      .uploadData(originalJpeg, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });

    // variants
    const ow = meta.width!; const oh = meta.height!;
    const resize = async (w: number, q: number) => {
      const width = Math.min(w, ow);
      const buf = await sharp(src)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: q })
        .toBuffer();
      const h = Math.round(oh * (width / ow));
      return { buf, width, height: h };
    };

    const thumb = await resize(480, 82);
    const large = await resize(2048, 88);

    const thumbPath = `${PUB_PREFIX}${slug}_480.jpg`;
    const largePath = `${PUB_PREFIX}${slug}_2048.jpg`;

    await container
      .getBlockBlobClient(thumbPath)
      .uploadData(thumb.buf, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });
    await container
      .getBlockBlobClient(largePath)
      .uploadData(large.buf, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });

    const photo = await prisma.photo.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        storagePath: originalPath,
        width: ow,
        height: oh,
        capturedAt: (exifData as any)?.DateTimeOriginal
          ? new Date((exifData as any).DateTimeOriginal)
          : ((exifData as any)?.CreateDate ? new Date((exifData as any).CreateDate) : null),
        exifRaw: exifData || {},
        published: publishNow, // フォーム指定があれば即公開
      },
    });

    await prisma.variant.deleteMany({ where: { photoId: photo.id } });
    await prisma.variant.createMany({
      data: [
        { photoId: photo.id, type: "thumb", width: thumb.width, height: thumb.height, storagePath: thumbPath, bytes: thumb.buf.length },
        { photoId: photo.id, type: "large", width: large.width, height: large.height, storagePath: largePath, bytes: large.buf.length },
      ],
    });

    const kws: string[] = Array.from(new Set(
      ([] as string[])
        .concat(((exifData?.Keywords || []) as string[]))
        .concat(((exifData?.Subject || []) as string[]))
        .filter((w) => typeof w === "string" && w.trim().length > 0)
        .map((w) => w.trim())
    ));
    if (kws.length) {
      await prisma.keyword.deleteMany({ where: { photoId: photo.id } });
      await prisma.keyword.createMany({ data: kws.slice(0, 16).map((word) => ({ photoId: photo.id, word })) });
    }

    // Optional: kick off WM generation asynchronously (non-blocking, no self-fetch)
    if (wantWm) {
      void generateWatermark({ slug, width: 2048 }).then(
        () => info("[upload] wm generate triggered", { slug }),
        (e) => warn("[upload] wm generate failed", { slug, err: e?.message || String(e) })
      );
    }
    return NextResponse.json({ ok: true, slug });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}