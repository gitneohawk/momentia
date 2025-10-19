import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";

type Photographer = {
  id: string;
  slug: string;
  name: string;
  displayName?: string | null;
  bio?: string | null;
  profileUrl?: string | null;
  website?: string | null;
  contactEmail?: string | null;
};

async function getPhotographers(): Promise<Photographer[]> {
  try {
    return await prisma.photographer.findMany({
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
      },
    });
  } catch (error) {
    console.error("[photographers] prisma fetch failed:", error);
    return [];
  }
}

export const metadata = {
  title: "Photographers - Momentia",
  description: "Momentia に参加するフォトグラファーの紹介ページです。",
};

export default async function PhotographersPage() {
  const photographers = await getPhotographers();
  const sorted = photographers.sort((a, b) => {
    const nameA = (a.displayName || a.name || "").toLowerCase();
    const nameB = (b.displayName || b.name || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <main className="bg-neutral-50 py-8 sm:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 sm:px-6">
        <header className="space-y-3 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Photographers
          </h1>
          <p className="text-sm text-neutral-600 sm:text-base">
            Momentia で作品を発表しているフォトグラファーをご紹介します。各プロフィールから作品ギャラリーへ移動できます。
          </p>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          {sorted.map((p) => (
            <article
              key={p.id}
              className="flex h-full flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
            >
              <div className="flex items-start gap-4">
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full bg-neutral-200 ring-1 ring-black/10">
                  {p.profileUrl ? (
                    <Image
                      src={p.profileUrl}
                      alt={p.displayName || p.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-neutral-900">
                    {p.displayName || p.name}
                  </h2>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">{p.slug}</p>
                </div>
              </div>

              {p.bio && (
                <p className="line-clamp-4 text-sm leading-relaxed text-neutral-700">{p.bio}</p>
              )}

              <div className="mt-auto flex flex-wrap gap-2 text-sm text-neutral-600">
                {p.website && (
                  <a
                    href={p.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium hover:bg-neutral-200"
                  >
                    Website
                  </a>
                )}
                {p.contactEmail && (
                  <a
                    href={`mailto:${p.contactEmail}`}
                    className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium hover:bg-neutral-200"
                  >
                    Contact
                  </a>
                )}
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/gallery?photographer=${encodeURIComponent(p.slug)}`}
                  className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
                >
                  ギャラリーを見る
                </Link>
              </div>
            </article>
          ))}

          {sorted.length === 0 && (
            <div className="col-span-full rounded-2xl bg-white p-6 text-center text-sm text-neutral-600 ring-1 ring-black/5">
              登録されているフォトグラファーがまだありません。
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
