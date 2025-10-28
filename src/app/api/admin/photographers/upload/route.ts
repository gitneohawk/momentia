import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { logger, serializeError } from "@/lib/logger";
import sharp from "sharp";
import { createRateLimiter } from "@/lib/rate-limit";
import { getBlobServiceClient } from "@/lib/azure-storage";
import { prisma } from "@/lib/prisma";
import { createAllowedHosts } from "@/lib/allowedHosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/admin/photographers/upload" });

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB should be more than enough for profile images
const MIME_ALLOW = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_HOSTS = createAllowedHosts();
const uploadLimiter = createRateLimiter({
  prefix: "admin:photographers:upload",
  limit: 30,
  windowMs: 60_000,
});

const CONTAINER = process.env.AZURE_PHOTOS_CONTAINER || "photos";
const PREFIX = "profiles/";
const OUTPUT_WIDTH = 512;
const OUTPUT_HEIGHT = 512;

function sanitizePart(input: string) {
  return input.replace(/[\r\n]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "invalid content-type" }, { status: 415 });
  }

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
    const photographerSlug = slugRaw ? slugify(slugRaw) : null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const f = file as File;
    const mime = (f.type || "").toLowerCase();
    if (!MIME_ALLOW.has(mime)) {
      return NextResponse.json({ error: "unsupported file type" }, { status: 415 });
    }

    const size = (f as any).size as number | undefined;
    if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    const src = Buffer.from(await f.arrayBuffer());
    const square = await sharp(src)
      .rotate()
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "cover", position: "attention" })
      .jpeg({ quality: 85 })
      .toBuffer();

    const baseName = sanitizePart((f.name || "profile").replace(/\.[^.]+$/, ""));
    const stamp = Date.now().toString(36);
    const key = `${PREFIX}${stamp}-${baseName}.jpg`;

    const service = getBlobServiceClient();
    const container = service.getContainerClient(CONTAINER);
    await container.createIfNotExists();

    const blob = container.getBlockBlobClient(key);
    await blob.uploadData(square, {
      blobHTTPHeaders: {
        blobContentType: "image/jpeg",
        blobCacheControl: "public, max-age=31536000, immutable",
      },
    });

    if (photographerSlug) {
      await prisma.photographer
        .update({
          where: { slug: photographerSlug },
          data: { profileUrl: key },
        })
        .catch((err) => {
          log.warn("Photographer auto-update failed", { slug: photographerSlug, err: serializeError(err) });
        });
    }

    return NextResponse.json({
      ok: true,
      path: key,
      blobPath: key,
      slug: photographerSlug ?? undefined,
      autoUpdated: Boolean(photographerSlug),
    });
  } catch (e: any) {
    log.error("Photographer upload failed", { err: serializeError(e) });
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
