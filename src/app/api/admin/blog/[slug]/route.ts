

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/blog/[slug]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
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
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
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
  if (typeof data.heroPath === "string" || data.heroPath === null) update.heroPath = data.heroPath;
  if (Array.isArray(data.tags)) update.tags = data.tags;
  if (typeof data.bodyMdx === "string") update.bodyMdx = data.bodyMdx;
  if (typeof data.published === "boolean") {
    update.published = data.published;
    update.publishedAt = data.published ? (data.date ? new Date(data.date) : new Date()) : null;
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

// DELETE /api/admin/blog/[slug]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
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