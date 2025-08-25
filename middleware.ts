import { withAuth } from "next-auth/middleware";

// Only require authentication; do RBAC (admin check) inside API/page handlers.
// If you already include `role` in the JWT, you can tighten the authorized callback later.
export default withAuth(
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
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};