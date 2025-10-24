// src/app/robots.txt/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse(
    `User-agent: *
Allow: /

Disallow: /admin/

Sitemap: https://www.momentia.photo/sitemap.xml
`,
    {
      headers: {
        "Content-Type": "text/plain",
      },
    }
  );
}
