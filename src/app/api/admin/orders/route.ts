// src/app/api/admin/orders/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PrismaClient } from "@prisma/client";
import { isAdminEmail } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";

const prisma = new PrismaClient();

export const runtime = "nodejs"; // 明示しておくと安心

const log = logger.child({ module: "api/admin/orders" });

const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const adminOrdersLimiter = createRateLimiter({ prefix: "admin:orders", limit: 60, windowMs: 60_000 });

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
  return null;
}

export async function GET(req: Request) {
  const session = await getServerSession();
  const email = session?.user?.email ?? "";
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bad = checkHostOrigin(req);
  if (bad) return bad;
  const { ok, resetSec } = await adminOrdersLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }

  try {
    const items = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ items });
  } catch (e) {
    log.error("Admin orders fetch failed", { err: serializeError(e) });
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
