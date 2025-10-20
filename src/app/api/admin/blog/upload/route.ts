import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/admin/blog/upload" });

// --- security constants / helpers ---
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB cap for hero images
const MIME_ALLOW = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const uploadLimiter = createRateLimiter({ prefix: "admin:blog:upload", limit: 20, windowMs: 60_000 });

function sanitizePart(s: string) {
  return s.replace(/[\r\n]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
}

const CONTAINER = process.env.AZURE_BLOG_CONTAINER || "blog";    // ← ブログ用に別コンテナ推奨
const PREFIX = "hero/";                                          // 例: hero/xxx.jpg

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9\-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
}

function getBlobService() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("missing storage connection");
  const map = new Map(conn.split(";").map(p => [p.split("=")[0], p.split("=")[1]] as [string,string]));
  const name = map.get("AccountName")!;
  const key  = map.get("AccountKey")!;
  const endpoint = map.get("BlobEndpoint") || `https://${name}.blob.core.windows.net`;
  const cred = new StorageSharedKeyCredential(name, key);
  return new BlobServiceClient(endpoint, cred);
}

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  return isAdminEmail(email);
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

    // Content-Length guard (cheap pre-check)
    const cl = req.headers.get("content-length");
    if (cl && Number(cl) > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    // Only allow multipart/form-data
    const ctype = (req.headers.get("content-type") || "").toLowerCase();
    if (!ctype.startsWith("multipart/form-data")) {
      return NextResponse.json({ error: "invalid content-type" }, { status: 415 });
    }

    // Host/Origin allowlist (basic CSRF defense even for admin)
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

  try {
    const form = await req.formData();
    const file = form.get("file");
    const slugRaw = (form.get("slug") || "").toString();
    const postSlug = slugRaw ? slugify(slugRaw) : null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const f = file as File;
    const mime = (f.type || "").toLowerCase();
    if (!MIME_ALLOW.has(mime)) {
      return NextResponse.json({ error: "unsupported file type" }, { status: 415 });
    }
    // Some runtimes expose f.size; if unavailable, rely on Content-Length above
    const fsize = (f as any).size as number | undefined;
    if (typeof fsize === "number" && fsize > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    const buf = Buffer.from(await f.arrayBuffer());
    // 例: 幅1600pxにリサイズ（必要なら無圧縮や別サイズも可）
    const hero = await sharp(buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();

    const baseName = sanitizePart((f as File).name.replace(/\.[^.]+$/, ""));
    const key = `${PREFIX}${slugify(baseName)}.jpg`;

    const service = getBlobService();
    const container = service.getContainerClient(CONTAINER);
    await container.createIfNotExists();
    const blob = container.getBlockBlobClient(key);
    await blob.uploadData(hero, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });

    // const publicUrl = `${container.url}/${key}`;

    // 記事slugが来ていたら heroPath を即保存（編集画面からの直更新に便利）
    if (postSlug) {
      await prisma.post.update({
        where: { slug: postSlug },
        data: { heroPath: key },
      }).catch(() => null);
    }

    return NextResponse.json({ ok: true, path: key });
  } catch (e: any) {
    log.error("Admin blog upload failed", { err: serializeError(e) });
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
