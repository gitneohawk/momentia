import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

const CANONICAL_HOST = "www.momentia.photo" as const;

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const host = (req.headers.get("host") || "").toLowerCase();
  const xf = (req.headers.get("x-forwarded-host") || "").toLowerCase();
  const xfs = xf ? xf.split(",").map((h) => h.trim()).filter(Boolean) : [];
  const candidates = [host, ...xfs];

  // In production, force all traffic to the canonical host for stable cookies/session.
  if (process.env.NODE_ENV === "production") {
    // Allow apex domain (momentia.photo) to remain as-is per product decision; only enforce for non-canonical hosts.
    const isCanonical = candidates.includes(CANONICAL_HOST);
    const isApex = candidates.includes("momentia.photo");
    if (!isCanonical && !isApex) {
      url.host = CANONICAL_HOST;
      url.protocol = "https:";
      return NextResponse.redirect(url, 308);
    }
  }

  const isDev = process.env.NODE_ENV !== "production";
  const disableCsp = process.env.DISABLE_DEV_CSP === "1" || process.env.DISABLE_DEV_CSP === "true";
  if (isDev && disableCsp) {
    return NextResponse.next();
  }

  // Do not attach CSP to API routes; redirect already handled above
  if (url.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const azuriteOrigins = isDev ? " http://localhost:10000 http://azurite-1:10000" : "";
  const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https:;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' data: blob: https:${azuriteOrigins};
    connect-src 'self' https:${azuriteOrigins};
    font-src 'self' https://fonts.gstatic.com data:;
    media-src 'self' https:${azuriteOrigins};
    frame-src 'self' https:;
    frame-ancestors 'none';
  `
    .replace(/\n/g, " ")
    .trim();

  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}

// Only require authentication; do RBAC (admin check) inside API/page handlers.
// If you already include `role` in the JWT, you can tighten the authorized callback later.
export const authMiddleware = withAuth(
  function middleware() {},
  {
    pages: { signIn: "/api/auth/signin" },
    callbacks: {
      authorized: ({ token }) => !!token, // logged-in users only
    },
  }
);

// Run middleware only for admin UIs and admin APIs
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)", // all app routes (including pages) but not static assets
    "/api/auth/:path*", // ensure canonical host for NextAuth
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
