import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient } from "@azure/storage-blob";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTAINER_NAME = "photos";

async function getContainer() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("missing storage connection");
  const service = BlobServiceClient.fromConnectionString(conn);
  return service.getContainerClient(CONTAINER_NAME);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));

    // Collect scalar updates
    const data: Record<string, any> = {};
    if (typeof body.caption === "string") data.caption = body.caption;
    if (typeof body.published === "boolean") data.published = body.published;

    // Normalize keywords if provided
    let incomingKeywords: string[] | null = null;
    if (Array.isArray(body.keywords)) {
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");
      const cleaned = body.keywords
        .map((x: unknown) => (typeof x === "string" ? norm(x) : ""))
        .filter((s: string) => s.length > 0)
        .slice(0, 32); // safety cap
      // de-duplicate while preserving order
      const seen = new Set<string>();
      incomingKeywords = cleaned.filter((s: string) => (seen.has(s) ? false : (seen.add(s), true)));
    }

    if (!Object.keys(data).length && incomingKeywords === null) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    // Ensure target exists and get id
    const base = await prisma.photo.findUnique({ where: { slug }, select: { id: true } });
    if (!base) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Execute updates in a transaction
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.photo.update({ where: { slug }, data });
      }
      if (incomingKeywords !== null) {
        await tx.keyword.deleteMany({ where: { photoId: base.id } });
        if (incomingKeywords.length) {
          await tx.keyword.createMany({
            data: incomingKeywords.map((word) => ({ photoId: base.id, word })),
          });
        }
      }
    });

    // Return updated snapshot (including relations for client sync)
    const updated = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true, keywords: true },
    });

    return NextResponse.json({ ok: true, photo: updated });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const { slug } = await params;

    // 1) DBから対象取得
    const photo = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true, keywords: true },
    });
    if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });

    // 2) Blob削除（originals + variants）
    const container = await getContainer();
    const targets = [
      photo.storagePath, // originals/<slug>.jpg
      ...photo.variants.map((v) => v.storagePath), // public/...
    ];
    for (const p of targets) {
      await container.getBlockBlobClient(p).deleteIfExists();
    }

    // 3) DB削除（子→親の順）
    await prisma.keyword.deleteMany({ where: { photoId: photo.id } });
    await prisma.variant.deleteMany({ where: { photoId: photo.id } });
    await prisma.photo.delete({ where: { id: photo.id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}