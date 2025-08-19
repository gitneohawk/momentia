// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const verbose = url.searchParams.get("verbose") === "1";

    const out: {
      ok: boolean;
      checks: {
        env: Record<string, boolean>;
        db: { ok: boolean; error?: string | true };
        blob: { ok: boolean; error?: string | true; accountKind?: string };
      };
      fatalError?: string;
    } = {
      ok: true,
      checks: {
        env: {},
        db: { ok: false },
        blob: { ok: false },
      },
    };

    // ---- env presence (値は出さない) ----
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

    // ---- DB check (Prisma を遅延 import) ----
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$queryRawUnsafe("SELECT 1");
      out.checks.db.ok = true;
    } catch (e: any) {
      out.ok = false;
      out.checks.db.ok = false;
      out.checks.db.error = verbose ? (e?.message ?? String(e)) : true;
      // ここで落ち原因（バイナリターゲット/SSL/接続など）が見えるはず
      console.error("[/api/health] DB error:", e);
    }

    // ---- Blob check ----
    try {
      const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (!conn) throw new Error("AZURE_STORAGE_CONNECTION_STRING is missing");
      const svc = BlobServiceClient.fromConnectionString(conn);
      const info = await svc.getAccountInfo();
      out.checks.blob.ok = true;
      if (verbose && info?.accountKind) out.checks.blob.accountKind = String(info.accountKind);
    } catch (e: any) {
      out.ok = false;
      out.checks.blob.ok = false;
      out.checks.blob.error = verbose ? (e?.message ?? String(e)) : true;
      console.error("[/api/health] Blob error:", e);
    }

    return NextResponse.json(out, {
      status: out.ok ? 200 : 500,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    // トップレベルでの想定外エラーもJSONで返す
    console.error("[/api/health] FATAL:", e);
    return NextResponse.json(
      { ok: false, fatalError: e?.message ?? String(e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}