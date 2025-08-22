import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient } from "@azure/storage-blob";

import sharp from "sharp";
import * as exifr from "exifr";

export const runtime = "nodejs";       // sharp を使うため Node 実行
export const dynamic = "force-dynamic"; // 開発中はキャッシュ無効でOK

const CONTAINER_NAME = "photos";
const ORIG_PREFIX = "originals/";
const PUB_PREFIX = "public/";


function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureContainer(conn: string) {
  const service = BlobServiceClient.fromConnectionString(conn);
  const container = service.getContainerClient(CONTAINER_NAME);
  await container.createIfNotExists(); // 権限はPortal側で設定済み想定
  return container;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const arrayBuffer = await (file as File).arrayBuffer();
    const src = Buffer.from(arrayBuffer);

    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    console.log("[storage]", conn?.includes("devstoreaccount1") ? "azurite" : conn?.split(";").slice(0,2).join(";"));
    if (!conn) return NextResponse.json({ error: "missing storage connection" }, { status: 500 });

    const container = await ensureContainer(conn);

    const base = (file as File).name.replace(/\.[^.]+$/, "");
    const slug = slugify(base);

    const img = sharp(src).withMetadata();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return NextResponse.json({ error: "invalid image" }, { status: 400 });

    const exifData: any = await (exifr as any).parse(src).catch(() => null);

    // originals
    const originalJpeg = await img.jpeg({ quality: 92 }).toBuffer();
    const originalPath = `${ORIG_PREFIX}${slug}.jpg`;
    await container
      .getBlockBlobClient(originalPath)
      .uploadData(originalJpeg, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });

    // variants
    const ow = meta.width!; const oh = meta.height!;
    const resize = async (w: number, q: number) => {
      const width = Math.min(w, ow);
      const buf = await sharp(src)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: q })
        .toBuffer();
      const h = Math.round(oh * (width / ow));
      return { buf, width, height: h };
    };

    const thumb = await resize(480, 82);
    const large = await resize(2048, 88);

    const thumbPath = `${PUB_PREFIX}${slug}_480.jpg`;
    const largePath = `${PUB_PREFIX}${slug}_2048.jpg`;

    await container
      .getBlockBlobClient(thumbPath)
      .uploadData(thumb.buf, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });
    await container
      .getBlockBlobClient(largePath)
      .uploadData(large.buf, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });

    const photo = await prisma.photo.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        storagePath: originalPath,
        width: ow,
        height: oh,
        capturedAt: (exifData as any)?.DateTimeOriginal
          ? new Date((exifData as any).DateTimeOriginal)
          : ((exifData as any)?.CreateDate ? new Date((exifData as any).CreateDate) : null),
        exifRaw: exifData || {},
        published: false, // 初期状態は非公開
      },
    });

    await prisma.variant.deleteMany({ where: { photoId: photo.id } });
    await prisma.variant.createMany({
      data: [
        { photoId: photo.id, type: "thumb", width: thumb.width, height: thumb.height, storagePath: thumbPath, bytes: thumb.buf.length },
        { photoId: photo.id, type: "large", width: large.width, height: large.height, storagePath: largePath, bytes: large.buf.length },
      ],
    });

    const kws: string[] = Array.from(new Set(
      ([] as string[])
        .concat(((exifData?.Keywords || []) as string[]))
        .concat(((exifData?.Subject || []) as string[]))
        .filter((w) => typeof w === "string" && w.trim().length > 0)
        .map((w) => w.trim())
    ));
    if (kws.length) {
      await prisma.keyword.deleteMany({ where: { photoId: photo.id } });
      await prisma.keyword.createMany({ data: kws.slice(0, 16).map((word) => ({ photoId: photo.id, word })) });
    }

    return NextResponse.json({ ok: true, slug });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}