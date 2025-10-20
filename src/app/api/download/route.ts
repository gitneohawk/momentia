// --- security helpers for download ---
const MAX_TOKEN_LEN = 128;
const MIN_TOKEN_LEN = 16;
// allow cuid/cuid2/hex/base64url-ish tokens (legacy含む)。UUIDのハイフンも許容
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEFAULT_SIZES = (process.env.DOWNLOAD_SIZES || '1024,2048')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function sanitizeFilenamePart(s: string) {
  // CR/LFや危険文字を除去し、スペース→アンダースコア
  return s.replace(/[\r\n]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 100);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

import { createRateLimiter } from "@/lib/rate-limit";
import { logger, serializeError } from "@/lib/logger";

const log = logger.child({ module: "api/download" });
const downloadLimiter = createRateLimiter({ prefix: "download", limit: 60, windowMs: 60_000 });

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
  const token = searchParams.get('token');
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const { ok, resetSec } = await downloadLimiter.hit(ip);
  if (!ok) {
    const r = NextResponse.json({ error: 'リクエストが多すぎます。' }, { status: 429 });
    r.headers.set('Retry-After', String(resetSec));
    return r;
  }

  if (!token) {
    return NextResponse.json({ error: 'トークンが指定されていません。' }, { status: 400 });
  }
  if (token.length < MIN_TOKEN_LEN || token.length > MAX_TOKEN_LEN || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: '不正なトークン形式です。' }, { status: 400 });
  }

  const reqSize = searchParams.get('size');
  const size = (reqSize && DEFAULT_SIZES.includes(reqSize))
    ? reqSize
    : (process.env.DOWNLOAD_SIZE || '2048');

  // Resolve order (AccessToken → legacy fallback)
  const resolved = await resolveDigitalOrderByToken(token);

  if (!resolved.order) {
    const status = resolved.accessTokenId ? 410 : 404; // AccessTokenが存在するが無効→410 Gone
    return NextResponse.json({ error: '無効または期限切れのトークンです。' }, { status });
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
  const basePath = (process.env.AZURE_BLOB_BASE_PATH || "originals")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const suffix = process.env.DOWNLOAD_SUFFIX != null
    ? process.env.DOWNLOAD_SUFFIX
    : basePath === "originals"
      ? ""
      : `_${size}`;

  // 例: originals/tulips.jpg (suffixが空の場合)
  const blobName = `${basePath}/${order.slug}${suffix}.jpg`;
  const safeSlug = sanitizeFilenamePart(order.slug);
  const safeSuffix = sanitizeFilenamePart(suffix);
  const downloadName = `${safeSlug}${safeSuffix}.jpg`;

  // Debug logging (redacted)
  log.debug("Download environment", {
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
    log.error("Storage credentials missing", {
      hasAcc: !!accountName,
      hasKey: !!accountKey,
    });
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
      contentDisposition: `attachment; filename="${downloadName}"`,
      contentType: 'image/jpeg',
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
        log.warn("Failed to increment token usage count", {
          tokenId: resolved.accessTokenId,
          err: serializeError(e),
        });
      }
    }

    const res = NextResponse.redirect(blobUrl);
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch (e) {
    log.error("Failed to generate download SAS", { err: serializeError(e) });
    return NextResponse.json(
      { error: "ダウンロードURLの生成に失敗しました。" },
      { status: 500 },
    );
  }
}
