// src/app/api/admin/orders/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PrismaClient } from "@prisma/client";
import { isAdminEmail } from "@/lib/auth";

const prisma = new PrismaClient();

export const runtime = "nodejs"; // 明示しておくと安心

export async function GET() {
  const session = await getServerSession();
  const email = session?.user?.email ?? "";
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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