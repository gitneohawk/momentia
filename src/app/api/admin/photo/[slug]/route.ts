import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient } from "@azure/storage-blob";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/admin/photo" });

const MAX_JSON_BYTES = 64 * 1024; // 64KB
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const adminPhotoLimiter = createRateLimiter({ prefix: "admin:photo", limit: 60, windowMs: 60_000 });

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

function checkHostOrigin(req: Request) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const origin = (req.headers.get("origin") || "").toLowerCase();
  if (origin) {
    try {
      const oh = new URL(origin).host.toLowerCase();
      if (!ALLOWED_HOSTS.has(oh)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  return null as Response | null;
}

function validateSlug(slug?: string): boolean {
  if (!slug) return false;
  return /^[a-z0-9-]{1,120}$/.test(slug);
}

const CONTAINER_NAME = "photos";

async function getContainer() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("missing storage connection");
  const service = BlobServiceClient.fromConnectionString(conn);
  return service.getContainerClient(CONTAINER_NAME);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const email = session.user?.email ?? "";
  if (!isAdminEmail(email)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await adminPhotoLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }
  try {
    const { slug } = await params;
    if (!validateSlug(slug)) return NextResponse.json({ error: "invalid slug" }, { status: 400 });
    const photo = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true, keywords: true, photographer: true },
    });
    if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });
    // Return full snapshot (sellDigital/sellPanel will be present if in schema)
    return NextResponse.json({ ok: true, photo });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const email = session.user?.email ?? "";
  if (!isAdminEmail(email)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  try {
    const bad = checkHostOrigin(req);
    if (bad) return bad;
    const { ok, resetSec } = await adminPhotoLimiter.hit(clientIp(req));
    if (!ok) {
      const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
      r.headers.set("Retry-After", String(resetSec));
      return r;
    }
    const cl = req.headers.get("content-length");
    if (cl && Number(cl) > MAX_JSON_BYTES) {
      return NextResponse.json({ error: "payload too large" }, { status: 413 });
    }
    const ctype = (req.headers.get("content-type") || "").toLowerCase();
    if (!ctype.startsWith("application/json")) {
      return NextResponse.json({ error: "invalid content-type" }, { status: 415 });
    }
    const { slug } = await params;
    if (!validateSlug(slug)) return NextResponse.json({ error: "invalid slug" }, { status: 400 });

    const body = await req.json().catch(() => ({}));

    // Collect scalar updates
    const data: Record<string, any> = {};
    if (typeof body.title === "string") data.title = body.title;
    if (typeof body.caption === "string") data.caption = body.caption;
    if (typeof body.published === "boolean") data.published = body.published;
    // New: selling flags
    if (typeof body.sellDigital === "boolean") data.sellDigital = body.sellDigital;
    if (typeof body.sellPanel === "boolean") data.sellPanel = body.sellPanel;

    // Accept price updates (supports multiple payload shapes)
    // Allowed keys: priceDigitalJPY (preferred), price, priceJPY
    const priceRaw = body.priceDigitalJPY ?? body.price ?? body.priceJPY;
    if (priceRaw !== undefined) {
      if (priceRaw === null) {
        data.priceDigitalJPY = null;
      } else {
        const n = Number(priceRaw);
        if (Number.isFinite(n) && n >= 0) {
          data.priceDigitalJPY = Math.trunc(n);
        }
      }
    }

    // A2 print price update
    const priceA2Raw = body.pricePrintA2JPY;
    if (priceA2Raw !== undefined) {
      if (priceA2Raw === null) {
        data.pricePrintA2JPY = null;
      } else {
        const n2 = Number(priceA2Raw);
        if (Number.isFinite(n2) && n2 >= 0) {
          data.pricePrintA2JPY = Math.trunc(n2);
        }
      }
    }

    // Normalize keywords if provided
    let incomingKeywords: string[] | null = null;
    if (Array.isArray(body.keywords)) {
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");
      const cleaned = body.keywords
        .map((x: unknown) => (typeof x === "string" ? norm(x) : ""))
        .filter((s: string) => s.length > 0)
        .slice(0, 32); // safety cap
      // de-duplicate while preserving order
      const seen = new Set<string>();
      incomingKeywords = cleaned.filter((s: string) => (seen.has(s) ? false : (seen.add(s), true)));
    }

    if (Object.prototype.hasOwnProperty.call(body, "photographerId")) {
      if (body.photographerId === null || body.photographerId === "") {
        data.photographerId = null;
      } else if (typeof body.photographerId === "string") {
        const pid = body.photographerId.trim();
        if (!pid) {
          data.photographerId = null;
        } else {
          const exists = await prisma.photographer.findUnique({ where: { id: pid }, select: { id: true } });
          if (!exists) {
            return NextResponse.json({ error: "invalid photographerId" }, { status: 400 });
          }
          data.photographerId = pid;
        }
      } else {
        return NextResponse.json({ error: "invalid photographerId" }, { status: 400 });
      }
    }

    if (!Object.keys(data).length && incomingKeywords === null) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    // Ensure target exists and get id
    const base = await prisma.photo.findUnique({ where: { slug }, select: { id: true } });
    if (!base) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Execute updates in a transaction
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.photo.update({ where: { slug }, data });
      }
      if (incomingKeywords !== null) {
        await tx.keyword.deleteMany({ where: { photoId: base.id } });
        if (incomingKeywords.length) {
          await tx.keyword.createMany({
            data: incomingKeywords.map((word) => ({ photoId: base.id, word })),
          });
        }
      }
    });

    // Return updated snapshot (including relations for client sync)
    const updated = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true, keywords: true, photographer: true },
    });

    return NextResponse.json({ ok: true, photo: updated });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const email = session.user?.email ?? "";
  if (!isAdminEmail(email)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await adminPhotoLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }
  try {
    const { slug } = await params;
    if (!validateSlug(slug)) return NextResponse.json({ error: "invalid slug" }, { status: 400 });
    // Structured diagnostics helper
    const logErr = (label: string, err: unknown) => {
      log.error("Admin photo delete step failed", {
        label,
        slug,
        err: serializeError(err),
      });
    };

    // 1) DBから対象取得
    const photo = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true, keywords: true },
    });
    if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });

    // 2) Blob削除（originals + variants） — falsy を除外しつつベストエフォートで削除
    const container = await getContainer();
    const targetsRaw = [
      photo.storagePath,
      ...photo.variants.map((v) => v.storagePath),
    ];
    const targets = targetsRaw.filter((p): p is string => typeof p === "string" && p.length > 0);
    const blobErrors: { path: string; error: string }[] = [];

    for (const p of targets) {
      try {
        await container.getBlockBlobClient(p).deleteIfExists();
      } catch (e: any) {
        blobErrors.push({ path: p, error: String(e?.message || e) });
        logErr(`blob-delete-failed path=${p}`, e);
        // 続行（DB 側の整合性を優先）。後で警告として返却。
      }
    }

    // 3) DB削除（子→親の順）
    await prisma.keyword.deleteMany({ where: { photoId: photo.id } });
    await prisma.variant.deleteMany({ where: { photoId: photo.id } });
    await prisma.photo.delete({ where: { id: photo.id } });

    return NextResponse.json({ ok: true, warnings: (typeof blobErrors !== "undefined" && blobErrors.length) ? { blobErrors } : undefined });
  } catch (e: any) {
    log.error("Admin photo delete handler failed", {
      slug: (await params as any)?.slug ?? "unknown",
      err: serializeError(e),
    });
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
