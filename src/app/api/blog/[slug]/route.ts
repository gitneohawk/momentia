// GET /api/blog/:slug   （公開記事 or 管理画面）
// PATCH /api/blog/:slug （更新：管理画面用）
// DELETE /api/blog/:slug（削除：管理画面用）
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 64 * 1024;
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const blogLimiter = createRateLimiter({ prefix: "blog:slug", limit: 60, windowMs: 60_000 });

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

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  if (!validateSlug(slug)) return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  // Removed checkHostOrigin for GET requests
  const { ok, resetSec } = await blogLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }
  const post = await prisma.post.findUnique({ where: { slug } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(req: Request, { params }: Params) {
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await blogLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }
  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > MAX_JSON_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.startsWith("application/json")) return NextResponse.json({ error: "invalid content-type" }, { status: 415 });
  const { slug } = await params;
  if (!validateSlug(slug)) return NextResponse.json({ error: "invalid slug" }, { status: 400 });

  // 認証保護は必要に応じて
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.description === "string" || body.description === null) data.description = body.description;
  if (typeof body.heroPath === "string" || body.heroPath === null) data.heroPath = body.heroPath;
  if (Array.isArray(body.tags)) data.tags = body.tags;
  if (typeof body.bodyMdx === "string") data.bodyMdx = body.bodyMdx;

  if (typeof body.published === "boolean") {
    data.published = body.published;
    if (body.published) {
      data.publishedAt = body.date ? new Date(body.date) : (new Date());
    } else {
      data.publishedAt = null;
    }
  }

  const updated = await prisma.post.update({ where: { slug }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  if (!validateSlug(slug)) return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await blogLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }
  await prisma.post.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}