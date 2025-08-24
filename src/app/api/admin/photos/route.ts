// src/app/api/admin/photos/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT || "";
const CONTAINER = "photos";

async function getSignedUrl(storagePath: string, ttlMinutes = 60): Promise<string> {
  const now = new Date();
  const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
  const expiresOn = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  // MSI 経路（User Delegation SAS）
  if (process.env.AZURE_USE_MSI === "1" && ACCOUNT) {
    const endpoint = `https://${ACCOUNT}.blob.core.windows.net`;
    const svc = new BlobServiceClient(endpoint, new DefaultAzureCredential());
    try {
      const udk = await svc.getUserDelegationKey(startsOn, expiresOn);
      const sas = generateBlobSASQueryParameters(
        {
          containerName: CONTAINER,
          blobName: storagePath,
          permissions: BlobSASPermissions.parse("r"),
          startsOn,
          expiresOn,
          version: "2021-08-06",
        },
        udk,
        ACCOUNT
      ).toString();
      return `${endpoint}/${CONTAINER}/${encodeURI(storagePath)}?${sas}`;
    } catch (e) {
      console.error("[/api/admin/photos] MSI SAS error:", e);
      // フォールバックへ
    }
  }

  // 共有キー（接続文字列）フォールバック
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const m = conn?.match(/AccountName=([^;]+).*AccountKey=([^;]+)/);
  if (m) {
    const [, acc, key] = m;
    const credential = new StorageSharedKeyCredential(acc, key);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: CONTAINER,
        blobName: storagePath,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn,
        version: "2021-08-06",
      },
      credential
    ).toString();
    return `https://${acc}.blob.core.windows.net/${CONTAINER}/${encodeURI(storagePath)}?${sas}`;
  }

  throw new Error("cannot sign blob url (no MSI or connection string)");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const photos = (await prisma.photo.findMany({
      orderBy: { createdAt: "desc" },
      include: { variants: true, keywords: true },
      take: 200,
    })) as Prisma.PhotoGetPayload<{ include: { variants: true; keywords: true } }>[];

    const items = await Promise.all(
      photos.map(async (p) => {
        const thumb = p.variants.find((v) => v.type === "thumb");
        const large = p.variants.find((v) => v.type === "large");
        return {
          slug: p.slug,
          width: p.width,
          height: p.height,
          caption: p.caption,
          published: p.published,
          priceDigitalJPY: p.priceDigitalJPY ?? null,
          keywords: p.keywords?.map((k) => k.word) ?? [],
          urls: {
            original: await getSignedUrl(p.storagePath),
            thumb: thumb ? await getSignedUrl(thumb.storagePath) : null,
            large: large ? await getSignedUrl(large.storagePath) : null,
          },
        };
      })
    );

    return new NextResponse(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      status: 200,
    });
  } catch (e: any) {
    console.error("/api/admin/photos GET error:", e);
    return new NextResponse(JSON.stringify({ error: String(e?.message || e) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
}