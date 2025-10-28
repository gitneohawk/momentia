function extractFirstImageKey(mdx: string): string | null {
  if (!mdx || typeof mdx !== "string") return null;
  // Match Markdown image: ![alt](/api/blog/image/<key>)
  const m = mdx.match(/!\[[^\]]*\]\(\s*(\/api\/blog\/image\/([^\)]+))\s*\)/);
  if (m && typeof m[2] === "string" && m[2].length > 0) return m[2];
  return null;
}
import { getServerSession } from "next-auth";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { createRateLimiter } from "@/lib/rate-limit";
import { createAllowedHosts } from "@/lib/allowedHosts";

const ADMIN_BLOG_LIMITER = createRateLimiter({ prefix: "admin:blog", limit: 30, windowMs: 60_000 }); // 30 req/min per IP
const MAX_JSON_BYTES = 64 * 1024; // 64KB
const ALLOWED_HOSTS = createAllowedHosts();

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

function checkHostOrigin(req: Request): Response | null {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return new NextResponse(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  const origin = (req.headers.get("origin") || "").toLowerCase();
  if (origin) {
    try {
      const oh = new URL(origin).host.toLowerCase();
      if (!ALLOWED_HOSTS.has(oh)) {
        return new NextResponse(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      }
    } catch {
      return new NextResponse(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
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

// GET /api/admin/blog/[slug]
export async function GET(
  req: Request,
  context: any
) {
  const { slug } = (context?.params ?? {}) as { slug?: string };
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await ADMIN_BLOG_LIMITER.hit(clientIp(req));
  if (!ok) return new NextResponse(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(resetSec) } });
  if (!validateSlug(slug)) return NextResponse.json({ error: "Missing or invalid slug" }, { status: 400 });
  if (!(await assertAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const post = await prisma.post.findUnique({ where: { slug } });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(post);
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PUT /api/admin/blog/[slug]
export async function PUT(
  req: Request,
  context: any
) {
  const { slug } = (context?.params ?? {}) as { slug?: string };
  if (!validateSlug(slug)) return NextResponse.json({ error: "Missing or invalid slug" }, { status: 400 });
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
  const { ok, resetSec } = await ADMIN_BLOG_LIMITER.hit(clientIp(req));
  if (!ok) return new NextResponse(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(resetSec) } });
  if (!(await assertAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 受け取り可能なフィールドだけに限定（安全のため）
  const update: any = {};
  if (typeof data.title === "string") update.title = data.title;
  if (typeof data.description === "string" || data.description === null) update.description = data.description;
  // heroPath is now derived from MDX, not accepted directly
  if (Array.isArray(data.tags)) update.tags = data.tags.filter((t: unknown) => typeof t === "string").slice(0, 20);
  if (typeof data.bodyMdx === "string") update.bodyMdx = data.bodyMdx;
  if (typeof data.bodyMdx === "string") {
    const heroKey = extractFirstImageKey(data.bodyMdx);
    // Derive heroPath from the first MDX image (MDX-only運用)
    update.heroPath = heroKey ?? null;
  }
  if (typeof data.published === "boolean") {
    update.published = data.published;
    update.publishedAt = data.published ? new Date() : null;
  }

  try {
    const updated = await prisma.post.update({ where: { slug }, data: update });
    return NextResponse.json(updated);
  } catch (_e: any) {
    if (_e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/admin/blog/[slug]
export async function PATCH(
  req: Request,
  context: any
) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
  const { ok, resetSec } = await ADMIN_BLOG_LIMITER.hit(clientIp(req));
  if (!ok) return new NextResponse(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(resetSec) } });
  return PUT(req, context);
}

// DELETE /api/admin/blog/[slug]
export async function DELETE(
  req: Request,
  context: any
) {
  const { slug } = (context?.params ?? {}) as { slug?: string };
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await ADMIN_BLOG_LIMITER.hit(clientIp(req));
  if (!ok) return new NextResponse(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(resetSec) } });
  if (!validateSlug(slug)) return NextResponse.json({ error: "Missing or invalid slug" }, { status: 400 });
  if (!(await assertAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const deleted = await prisma.post.delete({ where: { slug } });
    return NextResponse.json(deleted);
  } catch (_e: any) {
    if (_e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
