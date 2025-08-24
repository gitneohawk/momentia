import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

// 単一取得
export async function GET(_req: Request, { params }: Params) {
  try {
    const { slug } = params;
    const post = await prisma.post.findUnique({ where: { slug } });
    if (!post) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (e: any) {
    if (e.message && typeof e.message === "string" && e.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// 部分更新（エディタの保存は基本こちらを呼ぶ）
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { slug } = params;
    const body = await req.json();

    const data: any = {};
    if ("title" in body) data.title = body.title ?? null;
    if ("description" in body) data.description = body.description ?? null;
    if ("heroPath" in body) data.heroPath = body.heroPath ?? null;
    if ("tags" in body) data.tags = Array.isArray(body.tags) ? body.tags : [];
    if ("bodyMdx" in body) data.bodyMdx = body.bodyMdx ?? null;
    if ("published" in body) {
      data.published = !!body.published;
      if (body.published === true) {
        data.publishedAt = new Date();
      } else if (body.published === false) {
        data.publishedAt = null;
      }
    }
    // 何も変更なければ 400
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    data.updatedAt = new Date();
    const post = await prisma.post.update({
      where: { slug },
      data,
    });
    return NextResponse.json({ ok: true, post });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e.message && typeof e.message === "string" && e.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: e?.message || "update failed" }, { status: 400 });
  }
}

// 全量更新（存在しなければ作成）
export async function PUT(req: Request, { params }: Params) {
  try {
    const { slug } = params;
    const body = await req.json();
    const {
      title, description, heroPath, tags, bodyMdx, published,
    } = body || {};
    if (!slug || !title || !bodyMdx) {
      return new NextResponse("Missing fields", { status: 400 });
    }

    const now = new Date();
    const post = await prisma.post.upsert({
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
    return NextResponse.json({ ok: true, post });
  } catch (e: any) {
    if (e.message && typeof e.message === "string" && e.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// 削除
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { slug } = params;
    await prisma.post.delete({ where: { slug } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e.message && typeof e.message === "string" && e.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}