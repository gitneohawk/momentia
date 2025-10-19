import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);

const photographersLimiter = createRateLimiter({
  prefix: "admin:photographers",
  limit: 60,
  windowMs: 60_000,
});

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

function checkHostOrigin(req: Request) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const origin = (req.headers.get("origin") || "").toLowerCase();
  if (origin) {
    try {
      const oh = new URL(origin).host.toLowerCase();
      if (!ALLOWED_HOSTS.has(oh)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
    } catch {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  }
  return null as Response | null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const bad = checkHostOrigin(req);
  if (bad) return bad;

  const { ok, resetSec } = await photographersLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }

  try {
    const items = await prisma.photographer.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        name: true,
        displayName: true,
        contactEmail: true,
      },
    });

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[/api/admin/photographers] list failed", error);
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
