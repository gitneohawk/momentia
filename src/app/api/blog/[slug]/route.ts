// GET /api/blog/:slug   （公開記事 or 管理画面）
// PATCH /api/blog/:slug （更新：管理画面用）
// DELETE /api/blog/:slug（削除：管理画面用）
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_: Request, { params }: Params) {
  const { slug } = await params;
  const post = await prisma.post.findUnique({ where: { slug } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(req: Request, { params }: Params) {
  // 認証保護は必要に応じて
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.description === "string" || body.description === null) data.description = body.description;
  if (typeof body.heroPath === "string" || body.heroPath === null) data.heroPath = body.heroPath;
  if (Array.isArray(body.tags)) data.tags = body.tags;
  if (typeof body.bodyMdx === "string") data.bodyMdx = body.bodyMdx;

  if (typeof body.published === "boolean") {
    data.published = body.published;
    if (body.published) {
      data.publishedAt = body.date ? new Date(body.date) : (new Date());
    } else {
      data.publishedAt = null;
    }
  }

  const updated = await prisma.post.update({ where: { slug }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: Params) {
  const { slug } = await params;
  await prisma.post.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}