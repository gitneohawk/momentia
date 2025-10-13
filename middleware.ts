import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

export function middleware(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const disableCsp = process.env.DISABLE_DEV_CSP === "1" || process.env.DISABLE_DEV_CSP === "true";
  if (isDev && disableCsp) {
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
  `.replace(/\n/g, " ").trim();

  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", csp);
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)", "/admin/:path*", "/api/admin/:path*"],
};