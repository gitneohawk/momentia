export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const { slug } = await params;
    const photo = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true, keywords: true },
    });
    if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });
    // Return full snapshot (sellDigital/sellPanel will be present if in schema)
    return NextResponse.json({ ok: true, photo });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient } from "@azure/storage-blob";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
    // New: selling flags
    if (typeof body.sellDigital === "boolean") data.sellDigital = body.sellDigital;
    if (typeof body.sellPanel === "boolean") data.sellPanel = body.sellPanel;

    // Accept price updates (supports multiple payload shapes)
    // Allowed keys: priceDigitalJPY (preferred), price, priceJPY
    const priceRaw = body.priceDigitalJPY ?? body.price ?? body.priceJPY;
    if (priceRaw !== undefined) {
      if (priceRaw === null) {
        data.priceDigitalJPY = null;
      } else {
        const n = Number(priceRaw);
        if (Number.isFinite(n) && n >= 0) {
          data.priceDigitalJPY = Math.trunc(n);
        }
      }
    }

    // A2 print price update
    const priceA2Raw = body.pricePrintA2JPY;
    if (priceA2Raw !== undefined) {
      if (priceA2Raw === null) {
        data.pricePrintA2JPY = null;
      } else {
        const n2 = Number(priceA2Raw);
        if (Number.isFinite(n2) && n2 >= 0) {
          data.pricePrintA2JPY = Math.trunc(n2);
        }
      }
    }

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
    // Structured diagnostics helper
    const logErr = (label: string, err: unknown) => {
      console.error(`[photo:DELETE] ${label} slug=${slug}`, err);
    };

    // 1) DBから対象取得
    const photo = await prisma.photo.findUnique({
      where: { slug },
      include: { variants: true, keywords: true },
    });
    if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });

    // 2) Blob削除（originals + variants） — falsy を除外しつつベストエフォートで削除
    const container = await getContainer();
    const targetsRaw = [
      photo.storagePath,
      ...photo.variants.map((v) => v.storagePath),
    ];
    const targets = targetsRaw.filter((p): p is string => typeof p === "string" && p.length > 0);
    const blobErrors: { path: string; error: string }[] = [];

    for (const p of targets) {
      try {
        await container.getBlockBlobClient(p).deleteIfExists();
      } catch (e: any) {
        blobErrors.push({ path: p, error: String(e?.message || e) });
        logErr(`blob-delete-failed path=${p}`, e);
        // 続行（DB 側の整合性を優先）。後で警告として返却。
      }
    }

    // 3) DB削除（子→親の順）
    await prisma.keyword.deleteMany({ where: { photoId: photo.id } });
    await prisma.variant.deleteMany({ where: { photoId: photo.id } });
    await prisma.photo.delete({ where: { id: photo.id } });

    return NextResponse.json({ ok: true, warnings: (typeof blobErrors !== "undefined" && blobErrors.length) ? { blobErrors } : undefined });
  } catch (e: any) {
    console.error(`[photo:DELETE] unhandled slug=${(await params as any)?.slug ?? "unknown"}`, e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}