import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger, serializeError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/photographers" });

function resolveProfileImage(src?: string | null) {
  if (!src) return null;
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/api/")) {
    return src;
  }
  return `/api/photographers/image/${src.replace(/^\/+/, "")}`;
}

export async function GET() {
  try {
    const photographers = await prisma.photographer.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        name: true,
        displayName: true,
        bio: true,
        profileUrl: true,
        website: true,
        contactEmail: true,
        createdAt: true,
      },
    });

    const items = photographers.map((p) => ({
      ...p,
      profileUrl: resolveProfileImage(p.profileUrl),
    }));

    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    log.error("Photographers API failed", { err: serializeError(error) });
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
