import { NextResponse } from "next/server";
// import { auth } from "./auth"; // 使っていれば

export function middleware(req: Request) {
  const url = new URL(req.url);

  // ✅ APIは通す
  if (url.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // ✅ 管理画面のみ保護（例）
  if (url.pathname.startsWith("/admin")) {
    // ここでセッションチェックしたければする
    // const session = await auth(); // RSC auth等
    // if (!session) return NextResponse.redirect(new URL("/api/auth/signin", url));
    return NextResponse.next();
  }

  return NextResponse.next();
}

// ✅ matcherは /admin のみに。/api は含めないこと！
export const config = {
  matcher: ["/admin/:path*"],
};