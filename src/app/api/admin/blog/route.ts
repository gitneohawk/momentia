import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/blog  -> list posts (optionally filter)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50)
    );
    const where: Prisma.PostWhereInput =
      q.length > 0
        ? {
            OR: [
              { slug: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
              { title: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
              {
                description: {
                  contains: q,
                  mode: "insensitive" as Prisma.QueryMode,
                },
              },
            ],
          }
        : {};
    const posts = await prisma.post.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return NextResponse.json({ posts, items: posts, total: posts.length });
  } catch (e: any) {
    if (
      e.message &&
      typeof e.message === "string" &&
      e.message.toLowerCase().includes("unauthorized")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/blog  -> create or upsert a post
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      slug,
      title,
      description,
      heroPath,
      tags,
      bodyMdx,
      published,
    } = body || {};

    if (!slug || !title || !bodyMdx) {
      return NextResponse.json(
        { error: "slug, title, bodyMdx are required" },
        { status: 400 }
      );
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
        slug,
        title,
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
    if (
      e.message &&
      typeof e.message === "string" &&
      e.message.toLowerCase().includes("unauthorized")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: e?.message || "create failed" }, { status: 400 });
  }
}