function extractFirstImageKey(mdx: string): string | null {
  if (!mdx || typeof mdx !== "string") return null;
  // Match Markdown image: ![alt](/api/blog/image/<key>)
  const m = mdx.match(/!\[[^\]]*\]\(\s*(\/api\/blog\/image\/([^\)]+))\s*\)/);
  if (m && typeof m[2] === "string" && m[2].length > 0) return m[2];
  return null;
}
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  return email.endsWith("@evoluzio.com");
}

// GET /api/admin/blog/[slug]
export async function GET(
  _req: Request,
  context: any
) {
  const { slug } = (context?.params ?? {}) as { slug?: string };
  if (!(await assertAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  try {
    const post = await prisma.post.findUnique({ where: { slug } });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(post);
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PUT /api/admin/blog/[slug]
export async function PUT(
  req: Request,
  context: any
) {
  const { slug } = (context?.params ?? {}) as { slug?: string };
  if (!(await assertAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 受け取り可能なフィールドだけに限定（安全のため）
  const update: any = {};
  if (typeof data.title === "string") update.title = data.title;
  if (typeof data.description === "string" || data.description === null) update.description = data.description;
  // heroPath is now derived from MDX, not accepted directly
  if (Array.isArray(data.tags)) update.tags = data.tags.filter((t: unknown) => typeof t === "string").slice(0, 20);
  if (typeof data.bodyMdx === "string") update.bodyMdx = data.bodyMdx;
  if (typeof data.bodyMdx === "string") {
    const heroKey = extractFirstImageKey(data.bodyMdx);
    // Derive heroPath from the first MDX image (MDX-only運用)
    update.heroPath = heroKey ?? null;
  }
  if (typeof data.published === "boolean") {
    update.published = data.published;
    update.publishedAt = data.published ? new Date() : null;
  }

  try {
    const updated = await prisma.post.update({ where: { slug }, data: update });
    return NextResponse.json(updated);
  } catch (_e: any) {
    if (_e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/admin/blog/[slug]
export async function PATCH(
  req: Request,
  context: any
) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return PUT(req, context);
}

// DELETE /api/admin/blog/[slug]
export async function DELETE(
  _req: Request,
  context: any
) {
  const { slug } = (context?.params ?? {}) as { slug?: string };
  if (!(await assertAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  try {
    const deleted = await prisma.post.delete({ where: { slug } });
    return NextResponse.json(deleted);
  } catch (_e: any) {
    if (_e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}