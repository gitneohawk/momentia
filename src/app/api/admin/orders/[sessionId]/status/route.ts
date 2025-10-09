import { NextResponse } from "next/server";
import { PrismaClient, OrderStatus } from "@prisma/client";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/auth";

export const runtime = "nodejs";

const prisma = new PrismaClient();

export async function PUT(
  req: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const p = await context.params;
  // RBAC: admin only (based on isAdminEmail)
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const raw = String(body?.status ?? "").toLowerCase();
    const allowed = ["paid", "processing", "shipped", "canceled"] as const;
    if (!allowed.includes(raw as any)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const nextStatus = raw as OrderStatus;
    const updated = await prisma.order
      .update({
        where: { sessionId: p.sessionId },
        data: { status: nextStatus },
        select: { sessionId: true, status: true, updatedAt: true },
      })
      .catch(() => null);
    if (!updated) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error("Error occurred:", err);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}