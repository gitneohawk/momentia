// src/app/api/admin/orders/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const runtime = "nodejs"; // 明示しておくと安心

export async function GET() {
  try {
    const items = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[admin/orders] GET error", e);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}