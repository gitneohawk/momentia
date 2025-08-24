import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 一覧
export async function GET(_req: Request) {
  try {
    const items = await prisma.post.findMany({
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true, slug: true, title: true, published: true, updatedAt: true },
    });
    return NextResponse.json({ items });
  } catch (e: any) {
    if (e.message && e.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// 新規作成
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      slug, title, description, heroPath, tags, bodyMdx, published,
    } = body || {};

    if (!slug || !title || !bodyMdx) {
      return new NextResponse("Missing fields", { status: 400 });
    }

    const post = await prisma.post.create({
      data: {
        slug, title,
        description: description ?? null,
        heroPath: heroPath ?? null,
        tags: Array.isArray(tags) ? tags : [],
        bodyMdx,
        published: !!published,
        publishedAt: published ? new Date() : null,
      },
    });

    return NextResponse.json({ ok: true, post });
  } catch (e: any) {
    if (e?.code === "P2002") {
      // 一意キー重複（slug重複）
      return NextResponse.json({ error: "Duplicate slug" }, { status: 409 });
    }
    if (e.message && e.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// 更新（存在しなければ作成アップサート）
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const {
      slug, title, description, heroPath, tags, bodyMdx, published,
    } = body || {};
    if (!slug || !title || !bodyMdx) {
      return new NextResponse("Missing fields", { status: 400 });
    }

    const now = new Date();
    const result = await prisma.post.upsert({
      where: { slug },
      update: {
        title,
        description: description ?? null,
        heroPath: heroPath ?? null,
        tags: Array.isArray(tags) ? tags : [],
        bodyMdx,
        published: !!published,
        publishedAt: published ? now : null,
        updatedAt: now,
      },
      create: {
        slug, title,
        description: description ?? null,
        heroPath: heroPath ?? null,
        tags: Array.isArray(tags) ? tags : [],
        bodyMdx,
        published: !!published,
        publishedAt: published ? now : null,
      },
    });

    return NextResponse.json({ ok: true, post: result });
  } catch (e: any) {
    if (e.message && e.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// 削除
export async function DELETE(req: Request) {
  try {
    let slug: string | undefined;
    const url = new URL(req.url);
    // slug はクエリ or JSON のどちらでも受け付ける
    slug = url.searchParams.get("slug") ?? undefined;
    if (!slug) {
      try {
        const body = await req.json();
        slug = body?.slug;
      } catch {}
    }
    if (!slug) return new NextResponse("Missing slug", { status: 400 });

    await prisma.post.delete({ where: { slug } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e.message && e.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}