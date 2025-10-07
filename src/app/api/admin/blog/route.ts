import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  return email.endsWith("@evoluzio.com");
}

// GET /api/admin/blog  -> list posts (optionally filter)
export async function GET(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
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
  } catch (e) {
    console.error("Error occurred:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/blog  -> create or upsert a post
export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
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

    const tagsNorm = Array.isArray(tags)
      ? tags.filter((t: unknown) => typeof t === "string").slice(0, 20)
      : [];

    const now = new Date();
    const post = await prisma.post.upsert({
      where: { slug },
      update: {
        title,
        description: description ?? null,
        heroPath: heroPath ?? null,
        tags: tagsNorm,
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
        tags: tagsNorm,
        bodyMdx,
        published: !!published,
        publishedAt: published ? now : null,
        updatedAt: now,
      },
    });
    return NextResponse.json({ ok: true, post });
  } catch (e) {
    console.error("Error occurred:", e);
    const errorMessage =
      e && typeof e === "object" && "message" in e && typeof (e as any).message === "string"
        ? (e as any).message
        : "create failed";
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}