import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth/next";
import { createRateLimiter } from "@/lib/rate-limit";

// Feature flag: allow this endpoint only when explicitly enabled.
// In production, it returns 404 unless ENABLE_TEST_ROUTES=true is set on the server.
const ENABLE_TEST_ROUTES = process.env.ENABLE_TEST_ROUTES === "true";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "www.momentia.photo",
  ...(process.env.NEXT_PUBLIC_BASE_URL ? [new URL(process.env.NEXT_PUBLIC_BASE_URL).host] : []),
]);
const testMailLimiter = createRateLimiter({ prefix: "admin:test-mail", limit: 10, windowMs: 60_000 });

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

export async function GET(req: NextRequest) {
  // Hard-disable on production unless explicitly enabled
  if (process.env.NODE_ENV === "production" && !ENABLE_TEST_ROUTES) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bad = checkHostOrigin(req);
  if (bad) return bad;

  const { ok, resetSec } = await testMailLimiter.hit(clientIp(req));
  if (!ok) {
    const r = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    r.headers.set("Retry-After", String(resetSec));
    return r;
  }

  const searchParams = req.nextUrl.searchParams;
  const requestedTo = searchParams.get("to");
  const subject = searchParams.get("subject") || "Test Email";

  // In normal (flag off) mode, always send to the logged-in admin to avoid abuse.
  const to = ENABLE_TEST_ROUTES ? (requestedTo || session.user.email!) : session.user.email!;
  try {
    console.info(JSON.stringify({ level: "info", type: "mail.test", env: process.env.NODE_ENV, to, subject, by: session.user.email }));
    const { sendMail } = await import("@/lib/mailer");
    await sendMail({
      to,
      subject,
      html: `<p>This is a test email from <strong>Momentia</strong> via ACS.</p>`,
    });
    return NextResponse.json({ success: true, to, subject });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: String(err?.message ?? err) },
      { status: 503 }
    );
  }
}