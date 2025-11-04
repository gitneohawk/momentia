import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_JSON_BYTES = 8 * 1024; // 8KB cap
const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const adminOrderLimiter = createRateLimiter({ prefix: "admin:orders:status", limit: 60, windowMs: 60_000 });

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

function validateSessionId(id?: string): boolean {
  if (!id) return false;
  if (id.length > 200) return false;
  return /^[A-Za-z0-9_]+$/.test(id); // Stripe checkout session id like cs_test_...
}

const log = logger.child({ module: "api/admin/orders/status" });

export async function PUT(
  req: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const p = await context.params;

  const bad = checkHostOrigin(req);
  if (bad) return bad;

  const { ok, resetSec } = await adminOrderLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }

  if (!validateSessionId(p.sessionId)) {
    return NextResponse.json({ error: "invalid sessionId" }, { status: 400 });
  }

  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > MAX_JSON_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.startsWith("application/json")) {
    return NextResponse.json({ error: "invalid content-type" }, { status: 415 });
  }

  // RBAC: admin only (based on isAdminEmail)
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const raw = String(body?.status ?? "").toLowerCase();
    const allowed = ["paid", "processing", "shipped", "canceled"] as const;
    if (!allowed.includes(raw as any)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const nextStatus = raw as OrderStatus;
    const updated = await prisma.order
      .update({
        where: { sessionId: p.sessionId },
        data: { status: nextStatus },
        select: { sessionId: true, status: true, updatedAt: true },
      })
      .catch(() => null);
    if (!updated) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    log.error("Admin order status update failed", { sessionId: p.sessionId, err: serializeError(err) });
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
