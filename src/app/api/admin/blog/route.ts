import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 128 * 1024; // 128KB
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const adminBlogLimiter = createRateLimiter({ prefix: "admin:blog:index", limit: 60, windowMs: 60_000 });

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

function checkHostOrigin(req: Request): Response | null {
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
  return null;
}

function validateSlug(slug?: string): boolean {
  if (!slug) return false;
  return /^[a-z0-9-]{1,120}$/.test(slug);
}

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  return isAdminEmail(email);
}

// GET /api/admin/blog  -> list posts (optionally filter)
export async function GET(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await adminBlogLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().slice(0, 120);
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50)
    );
    const where: Prisma.PostWhereInput =
      q.length > 0
        ? {
            OR: [
              { slug: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
              { title: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
              {
                description: {
                  contains: q,
                  mode: "insensitive" as Prisma.QueryMode,
                },
              },
            ],
          }
        : {};
    const posts = await prisma.post.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return NextResponse.json({ posts, items: posts, total: posts.length });
  } catch (e) {
    console.error("Error occurred:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/blog  -> create or upsert a post
export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > MAX_JSON_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.startsWith("application/json")) {
    return NextResponse.json({ error: "invalid content-type" }, { status: 415 });
  }
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await adminBlogLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }
  try {
    const body = await req.json();
    const {
      slug,
      title,
      description,
      heroPath,
      tags,
      bodyMdx,
      published,
    } = body || {};

    if (!validateSlug(slug) || typeof title !== "string" || typeof bodyMdx !== "string") {
      return NextResponse.json(
        { error: "invalid fields: slug/title/bodyMdx" },
        { status: 400 }
      );
    }
    const titleTrim = title.trim().slice(0, 200);
    const descTrim = typeof description === "string" ? description.trim().slice(0, 400) : null;

    const tagsNorm = Array.isArray(tags)
      ? tags.filter((t: unknown) => typeof t === "string").slice(0, 20)
      : [];

    const now = new Date();
    const post = await prisma.post.upsert({
      where: { slug },
      update: {
        title: titleTrim,
        description: descTrim,
        heroPath: heroPath ?? null,
        tags: tagsNorm,
        bodyMdx,
        published: !!published,
        publishedAt: published ? now : null,
        updatedAt: now,
      },
      create: {
        slug,
        title: titleTrim,
        description: descTrim,
        heroPath: heroPath ?? null,
        tags: tagsNorm,
        bodyMdx,
        published: !!published,
        publishedAt: published ? now : null,
        updatedAt: now,
      },
    });
    return NextResponse.json({ ok: true, post });
  } catch (e) {
    console.error("Error occurred:", e);
    const errorMessage =
      e && typeof e === "object" && "message" in e && typeof (e as any).message === "string"
        ? (e as any).message
        : "create failed";
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}