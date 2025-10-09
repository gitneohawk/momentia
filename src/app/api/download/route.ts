import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

/**
 * Read storage credentials from env. We prefer explicit account + key,
 * then fall back to parsing from the connection string.
 */
function getStorageCreds() {
  let accountName =
    process.env.AZURE_STORAGE_ACCOUNT ||
    process.env.AZURE_STORAGE_ACCOUNT_NAME ||
    "";
  let accountKey =
    process.env.AZURE_STORAGE_KEY ||
    process.env.AZURE_STORAGE_ACCOUNT_KEY ||
    "";

  // Fallback: parse from connection string if either field is missing
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING || "";
  if ((!accountName || !accountKey) && conn) {
    const mAcc = conn.match(/AccountName=([^;]+)/i);
    const mKey = conn.match(/AccountKey=([^;]+)/i);
    if (!accountName && mAcc) accountName = mAcc[1];
    if (!accountKey && mKey) accountKey = mKey[1];
  }

  return { accountName, accountKey };
}

/**
 * Resolve download target by token.
 * 1) New path: AccessToken(id) → Order (kind=digital, not revoked/expired, within usage)
 * 2) Legacy fallback: Order.downloadToken
 */
async function resolveDigitalOrderByToken(token: string) {
  // Try AccessToken path first
  const at = await prisma.accessToken.findUnique({
    where: { id: token },
    include: { order: { select: { id: true, slug: true, itemType: true } } },
  }).catch(() => null);

  if (at?.order) {
    const now = new Date();
    const validKind = at.kind === "digital";
    const notRevoked = !at.revoked;
    const notExpired = !at.expiresAt || at.expiresAt > now;
    const withinUsage =
      (at.maxUses ?? 1) === 0 // 0 means unlimited
        ? true
        : (at.used ?? 0) < (at.maxUses ?? 1);

    if (validKind && notRevoked && notExpired && withinUsage) {
      return {
        order: at.order,
        accessTokenId: at.id,
        shouldCountUse: true,
      } as const;
    }
    // Token exists but invalid
    return { order: null, accessTokenId: at.id, shouldCountUse: false } as const;
  }

  // Legacy fallback: Order.downloadToken
  const legacy = await prisma.order.findFirst({
    where: { downloadToken: token },
    select: { id: true, slug: true, itemType: true },
  }).catch(() => null);

  if (legacy) {
    return { order: legacy, accessTokenId: null, shouldCountUse: false } as const;
  }

  return { order: null, accessTokenId: null, shouldCountUse: false } as const;
}

// GET /api/download?token=xxxx[&size=2048]
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const size = searchParams.get("size") || process.env.DOWNLOAD_SIZE || "2048"; // default 2048px variant

  if (!token) {
    return NextResponse.json({ error: "トークンが指定されていません。" }, { status: 400 });
  }

  // Resolve order (AccessToken → legacy fallback)
  const resolved = await resolveDigitalOrderByToken(token);

  if (!resolved.order) {
    return NextResponse.json({ error: "無効または期限切れのトークンです。" }, { status: 404 });
  }

  const order = resolved.order;

  if (order.itemType !== "digital") {
    return NextResponse.json({ error: "デジタル商品のみダウンロード可能です。" }, { status: 403 });
  }

  if (!order.slug) {
    return NextResponse.json({ error: "関連するファイルが見つかりません。" }, { status: 404 });
  }

  const { accountName, accountKey } = getStorageCreds();
  const containerName = process.env.AZURE_STORAGE_CONTAINER || "photos";
  const basePath = process.env.AZURE_BLOB_BASE_PATH || "public"; // e.g. photos/public/xxx
  const suffix = process.env.DOWNLOAD_SUFFIX || `_${size}`; // e.g. _2048

  // 例: public/tulips_2048.jpg
  const blobName = `${basePath}/${order.slug}${suffix}.jpg`;

  // Debug logging (redacted)
  console.log("[download] env", {
    hasAcc: !!accountName,
    hasKey: !!accountKey,
    hasConn: !!process.env.AZURE_STORAGE_CONNECTION_STRING,
    containerName,
    basePath,
    suffix,
    blobName,
    via: resolved.accessTokenId ? "accessToken" : "legacy",
  });

  if (!accountName || !accountKey) {
    console.error("[download] storage credentials missing");
    return NextResponse.json({ error: "ストレージの資格情報が未設定です。" }, { status: 500 });
  }

  try {
    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey,
    );

    const sasOptions = {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(),
      expiresOn: new Date(Date.now() + 15 * 60 * 1000), // 15分
      contentDisposition: `attachment; filename="${order.slug}${suffix}.jpg"`,
      contentType: "image/jpeg",
    } as const;

    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      sharedKeyCredential,
    ).toString();

    const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURI(
      blobName,
    )}?${sasToken}`;

    // 使用回数カウント（AccessToken経由のときのみ）
    if (resolved.accessTokenId && resolved.shouldCountUse) {
      try {
        await prisma.accessToken.update({
          where: { id: resolved.accessTokenId },
          data: { used: { increment: 1 } },
        });
      } catch (e) {
        // カウント失敗はダウンロード自体を妨げない（ログのみ）
        console.error("[download] failed to increment usedCount", e);
      }
    }

    return NextResponse.redirect(blobUrl);
  } catch (e) {
    console.error("[download] failed to generate SAS", e);
    return NextResponse.json(
      { error: "ダウンロードURLの生成に失敗しました。" },
      { status: 500 },
    );
  }
}