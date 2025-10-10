import { withAuth } from "next-auth/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// CSP relax for Azurite (enforced). Enabled if AZURE_BLOB_PUBLIC_BASE is http:// or ENABLE_DEV_CSP=1
function applyDevCsp(req: NextRequest, res: NextResponse) {
  const base = (process.env.AZURE_BLOB_PUBLIC_BASE || "").trim();
  const enable = base.startsWith("http://") || process.env.ENABLE_DEV_CSP === "1";
  if (!enable) return res; // do nothing in real prod

  // Resolve host/port from AZURE_BLOB_PUBLIC_BASE for precise allowlist
  let allowOrigin = "";
  try { allowOrigin = new URL(base).origin; } catch {}

  const img = [
    "'self'",
    "data:",
    "blob:",
    "https:",
    // Azurite hosts
    allowOrigin || "http://localhost:10000",
    "http://localhost:10000",
    "http://azurite-1:10000",
  ].join(" ");

  const conn = [
    "'self'",
    allowOrigin || "http://localhost:10000",
    "http://localhost:10000",
    "http://azurite-1:10000",
  ].join(" ");

  const csp = [
    `default-src 'self'`,
    `img-src ${img}`,
    `connect-src ${conn}`,
    `frame-src https://js.stripe.com`,
    `script-src 'self' https://js.stripe.com`,
    `style-src 'self' 'unsafe-inline'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join("; ");

  // ENFORCE (not report-only) so images actually load in production-mode Docker
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

// Use withAuth but authorize only for admin paths. For others, allow through.
export default withAuth(
  function middleware(req: NextRequest) {
    // Always return a response so we can attach headers
    const res = NextResponse.next();
    return applyDevCsp(req, res);
  },
  {
    pages: { signIn: "/api/auth/signin" },
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname || "";
        const isAdminPath = path.startsWith("/admin/") || path === "/admin" || path.startsWith("/api/admin/");
        return isAdminPath ? !!token : true; // only admin paths require login
      },
    },
  }
);

// Run on (almost) all paths so CSP applies sitewide; skip Next.js internals & assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};