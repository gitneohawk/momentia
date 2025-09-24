import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from "@azure/storage-blob";

// GET /api/download?token=xxxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "トークンが指定されていません。" }, { status: 400 });
  }

  // 注文をトークンで検索
  const order = await prisma.order.findFirst({
    where: { downloadToken: token },
    select: { id: true, slug: true, itemType: true },
  });

  if (!order) {
    return NextResponse.json({ error: "無効または期限切れのトークンです。" }, { status: 404 });
  }

  if (order.itemType !== "digital") {
    return NextResponse.json({ error: "デジタル商品のみダウンロード可能です。" }, { status: 403 });
  }

  if (!order.slug) {
    return NextResponse.json({ error: "関連するファイルが見つかりません。" }, { status: 404 });
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME!;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY!;
  const containerName = process.env.AZURE_STORAGE_CONTAINER || "photos";

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const sasOptions = {
    containerName,
    blobName: `${order.slug}.jpg`,
    permissions: BlobSASPermissions.parse("r"),
    startsOn: new Date(),
    expiresOn: new Date(Date.now() + 15 * 60 * 1000), // 15分有効
  };

  const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
  const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${order.slug}.jpg?${sasToken}`;

  return NextResponse.redirect(blobUrl);
}