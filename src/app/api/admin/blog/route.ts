import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (e.message && e.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}