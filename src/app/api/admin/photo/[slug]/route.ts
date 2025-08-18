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
  { params }: { params: { slug: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const { slug } = params;
    const body = await req.json().catch(() => ({}));

    const data: Record<string, any> = {};
    if (typeof body.caption === "string") data.caption = body.caption;
    if (typeof body.published === "boolean") data.published = body.published;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    await prisma.photo.update({ where: { slug }, data });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const { slug } = params;

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