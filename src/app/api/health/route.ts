// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, any> = { ok: true, checks: {} };

  try {
    // DB: SELECT 1 相当
    const count = await prisma.photo.count();
    result.checks.db = { ok: true, photoCount: count };
  } catch (e: any) {
    result.ok = false;
    result.checks.db = { ok: false, error: e?.message };
  }

  try {
    // Blob: 単にクライアントが作れるかどうか（実アクセスはしない）
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!conn) throw new Error("AZURE_STORAGE_CONNECTION_STRING missing");
    const client = BlobServiceClient.fromConnectionString(conn);
    // アカウント情報取得（軽い）
    const props = await client.getAccountInfo();
    result.checks.blob = { ok: true, sku: props?.skuName };
  } catch (e: any) {
    result.ok = false;
    result.checks.blob = { ok: false, error: e?.message };
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}