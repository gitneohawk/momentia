import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTAINER = process.env.AZURE_BLOG_CONTAINER || "blog";    // ← ブログ用に別コンテナ推奨
const PREFIX = "hero/";                                          // 例: hero/xxx.jpg

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9\-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
}

function getBlobService() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("missing storage connection");
  const map = new Map(conn.split(";").map(p => [p.split("=")[0], p.split("=")[1]] as [string,string]));
  const name = map.get("AccountName")!;
  const key  = map.get("AccountKey")!;
  const endpoint = map.get("BlobEndpoint") || `https://${name}.blob.core.windows.net`;
  const cred = new StorageSharedKeyCredential(name, key);
  return new BlobServiceClient(endpoint, cred);
}

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  return isAdminEmail(email);
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const slugRaw = (form.get("slug") || "").toString(); // 任意: 記事slugを渡してもらう
    const postSlug = slugRaw ? slugify(slugRaw) : null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const buf = Buffer.from(await (file as File).arrayBuffer());
    // 例: 幅1600pxにリサイズ（必要なら無圧縮や別サイズも可）
    const hero = await sharp(buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();

    const baseName = (file as File).name.replace(/\.[^.]+$/, "");
    const key = `${PREFIX}${slugify(baseName)}.jpg`;

    const service = getBlobService();
    const container = service.getContainerClient(CONTAINER);
    await container.createIfNotExists();
    const blob = container.getBlockBlobClient(key);
    await blob.uploadData(hero, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });

    // const publicUrl = `${container.url}/${key}`;

    // 記事slugが来ていたら heroPath を即保存（編集画面からの直更新に便利）
    if (postSlug) {
      await prisma.post.update({
        where: { slug: postSlug },
        data: { heroPath: key },
      }).catch(() => null);
    }

    return NextResponse.json({ ok: true, path: key });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}