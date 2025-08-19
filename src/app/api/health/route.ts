// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verbose = url.searchParams.get("verbose") === "1";

  const out: any = {
    ok: true,
    checks: {
      env: {},
      db: { ok: false },
      blob: { ok: false },
    },
  };

  // 環境変数の有無チェック（存在/未設定のみ。値は出さない）
  const has = (k: string) => !!process.env[k] && process.env[k]!.length > 0;
  out.checks.env = {
    DATABASE_URL: has("DATABASE_URL"),
    AZURE_STORAGE_CONNECTION_STRING: has("AZURE_STORAGE_CONNECTION_STRING"),
    NEXTAUTH_URL: has("NEXTAUTH_URL"),
    NEXTAUTH_SECRET: has("NEXTAUTH_SECRET"),
    AZURE_AD_CLIENT_ID: has("AZURE_AD_CLIENT_ID"),
    AZURE_AD_CLIENT_SECRET: has("AZURE_AD_CLIENT_SECRET"),
    AZURE_AD_TENANT_ID: has("AZURE_AD_TENANT_ID"),
    NEXT_PUBLIC_BASE_URL: has("NEXT_PUBLIC_BASE_URL"),
  };

  // 1) DB: SELECT 1 で到達性テスト
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    out.checks.db.ok = true;
  } catch (e: any) {
    out.ok = false;
    out.checks.db.ok = false;
    out.checks.db.error = verbose ? (e?.message ?? String(e)) : true;
    console.error("[/api/health] DB error:", e);
  }

  // 2) Blob: 接続文字列からアカウント情報取得
  try {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING!;
    const svc = BlobServiceClient.fromConnectionString(conn);
    // アカウント情報を叩ければ接続OK
    const info = await svc.getAccountInfo();
    out.checks.blob.ok = true;
    if (verbose) out.checks.blob.accountKind = info.accountKind;
  } catch (e: any) {
    out.ok = false;
    out.checks.blob.ok = false;
    out.checks.blob.error = verbose ? (e?.message ?? String(e)) : true;
    console.error("[/api/health] Blob error:", e);
  }

  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}