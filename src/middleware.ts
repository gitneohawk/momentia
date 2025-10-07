// middleware.ts
import { NextResponse } from "next/server";

export function middleware(req: Request) {
  const start = Date.now();
  const res = NextResponse.next();

  res.headers.set("x-start-time", start.toString());

  res.headers.append("x-log", "true");

  res.headers.delete("x-temp");
  
  // ログはレスポンス完了後に出す仕組みが必要（Next.jsだとEdge Functionsの制約もあり）
  console.log(JSON.stringify({
    type: "http.access",
    method: req.method,
    url: req.url,
    time: new Date().toISOString(),
  }));

  return res;
}