import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { isAdminEmail } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";

// 管理API: /api/admin/inquiries
const MAX_JSON_BYTES = 32 * 1024; // 32KB
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

function checkHostOrigin(req: Request) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const origin = (req.headers.get("origin") || "").toLowerCase();
  if (origin) {
    try {
      const oh = new URL(origin).host.toLowerCase();
      if (!ALLOWED_HOSTS.has(oh)) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
    } catch {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  }
  return null as Response | null;
}

const rlGet = createRateLimiter({ prefix: "admin:inquiries:get", limit: 60, windowMs: 60_000 });
const rlPatch = createRateLimiter({ prefix: "admin:inquiries:patch", limit: 30, windowMs: 60_000 });
// NOTE: /admin 配下は Entra ID で保護されている前提です。必要に応じてここでも追加の認可チェックを入れてください。

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["NEW", "OPEN", "CLOSED"]),
});

const log = logger.child({ module: "api/admin/inquiries" });

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await rlGet.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }

  try {
    const items = await prisma.inquiry.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        message: true,
        status: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ ok: true, items }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    log.error("Admin inquiries fetch failed", { err: serializeError(e) });
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > MAX_JSON_BYTES) {
    return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.startsWith("application/json")) {
    return NextResponse.json({ ok: false, error: "invalid content-type" }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }
  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await rlPatch.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }

  try {
    const json = await req.json();
    const { id, status } = patchSchema.parse(json);

    await prisma.inquiry.update({ where: { id }, data: { status } });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return NextResponse.json({ ok: false, errors: e.flatten?.() }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    log.error("Admin inquiries update failed", { err: serializeError(e) });
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
