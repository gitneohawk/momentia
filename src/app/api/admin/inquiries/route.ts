

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// 管理API: /api/admin/inquiries
// NOTE: /admin 配下は Entra ID で保護されている前提です。必要に応じてここでも追加の認可チェックを入れてください。

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["NEW", "OPEN", "CLOSED"]),
});

export async function GET() {
  try {
    const items = await prisma.inquiry.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        message: true,
        status: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ ok: true, items }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(req: Request) {
  try {
    const json = await req.json();
    const { id, status } = patchSchema.parse(json);

    await prisma.inquiry.update({ where: { id }, data: { status } });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return NextResponse.json({ ok: false, errors: e.flatten?.() }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    console.error(e);
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}