import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

import sharp from "sharp";
import * as exifr from "exifr";
import { generateWatermark } from "@/lib/watermark";
import { getToken } from "next-auth/jwt";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";       // sharp を使うため Node 実行
export const dynamic = "force-dynamic"; // 開発中はキャッシュ無効でOK

// --- security constants ---
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const MIME_ALLOW = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);

const uploadLimiter = createRateLimiter({ prefix: "upload", limit: 10, windowMs: 10 * 60_000 }); // 10 req / 10min per IP

function stripGps(exif: any) {
  if (!exif || typeof exif !== "object") return exif;
  const o = { ...exif };
  for (const k of Object.keys(o)) {
    if (/^gps/i.test(k)) delete (o as any)[k];
  }
  return o;
}

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
    // Preflight: size limit (protect memory) using Content-Length if provided
    const cl = req.headers.get("content-length");
    if (cl && Number(cl) > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    // Only accept multipart/form-data
    const ctype = (req.headers.get("content-type") || "").toLowerCase();
    if (!ctype.startsWith("multipart/form-data")) {
      return NextResponse.json({ error: "invalid content-type" }, { status: 415 });
    }

    // Host / Origin checks (basic CSRF mitigation for admin-only endpoint)
    const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
    if (!host || !ALLOWED_HOSTS.has(host)) {
      return NextResponse.json({ error: "forbidden host" }, { status: 403 });
    }
    const origin = (req.headers.get("origin") || "").toLowerCase();
    if (origin) {
      try {
        const oh = new URL(origin).host.toLowerCase();
        if (!ALLOWED_HOSTS.has(oh)) {
          return NextResponse.json({ error: "forbidden origin" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "forbidden origin" }, { status: 403 });
      }
    }

    // Rate limit per IP
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const { ok, resetSec } = await uploadLimiter.hit(ip);
    if (!ok) {
      const r = NextResponse.json({ error: "too many requests" }, { status: 429 });
      r.headers.set("Retry-After", String(resetSec));
      return r;
    }

    // Require authenticated admin (NextAuth via Entra ID)
    const token = await getToken({ req: req as any });
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const wantWm = (form.get("wm") === "1" || form.get("wm") === "true");
    const publishNow = (form.get("publish") === "1" || form.get("publish") === "true");
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const f = file as File;
    if (!MIME_ALLOW.has((f.type || "").toLowerCase())) {
      return NextResponse.json({ error: "unsupported file type" }, { status: 415 });
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
        exifRaw: stripGps(exifData) || {},
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