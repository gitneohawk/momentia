// src/app/api/debug/env/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const has = (k: string) => !!process.env[k] && process.env[k]!.length > 0;

  return NextResponse.json({
    ok: true,
    env: {
      DATABASE_URL: has("DATABASE_URL"),
      AZURE_STORAGE_CONNECTION_STRING: has("AZURE_STORAGE_CONNECTION_STRING"),
      NEXTAUTH_URL: has("NEXTAUTH_URL"),
      NEXTAUTH_SECRET: has("NEXTAUTH_SECRET"),
      AZURE_AD_CLIENT_ID: has("AZURE_AD_CLIENT_ID"),
      AZURE_AD_CLIENT_SECRET: has("AZURE_AD_CLIENT_SECRET"),
      AZURE_AD_TENANT_ID: has("AZURE_AD_TENANT_ID"),
      NEXT_PUBLIC_BASE_URL: has("NEXT_PUBLIC_BASE_URL"),
    },
  });
}