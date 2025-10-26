import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import Pagination from "@/components/Pagination";

function getHeroUrl(heroPath: string | null | undefined) {
  if (!heroPath) return undefined;
  if (heroPath.startsWith("http") || heroPath.startsWith("/api/")) return heroPath;
  return `/api/blog/image/${heroPath}`;
}

// Helper to extract first image key from description or bodyMdx, prioritizing heroPath
function firstImageKey({
  description,
  bodyMdx,
  heroPath,
}: {
  description?: string | null;
  bodyMdx?: string | null;
  heroPath?: string | null;
}): string | null {
  if (heroPath) {
    let normalized = heroPath;
    if (normalized.startsWith("/api/blog/image/")) {
      normalized = normalized.slice("/api/blog/image/".length);
    }
    return normalized || null;
  }

  const extract = (text: string | null | undefined) => {
    if (!text) return null;
    const match = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (match) {
      let key = match[1];
      if (key.startsWith("/api/blog/image/")) {
        key = key.slice("/api/blog/image/".length);
      }
      return key || null;
    }
    return null;
  };

  return extract(description) || extract(bodyMdx) || null;
}

export const revalidate = 60;

type SearchParams = Promise<{ page?: string }>;

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const perPage = 10;

  // total count first
  const totalCount = await prisma.post.count({
    where: { published: true },
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  // clamp current page into 1..totalPages
  const requestedPage = Number(sp?.page ?? "1");
  const page =
    Math.min(Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1), totalPages);

  const posts = await prisma.post.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      tags: true,
      publishedAt: true,
      heroPath: true,
      bodyMdx: true,
    },
  });

  return (
    <div className="px-4 sm:px-6 max-w-6xl mx-auto py-10">
      <h1 className="text-3xl font-semibold mb-6">Blog</h1>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => {
          const imageKey = firstImageKey({
            description: p.description,
            bodyMdx: p.bodyMdx,
            heroPath: p.heroPath,
          });
          const imageUrl = imageKey ? getHeroUrl(imageKey) : undefined;
          return (
            <article
              key={p.id}
              className="rounded-2xl border p-5 hover:shadow-md transition-shadow flex flex-col"
            >
              {imageUrl ? (
                <div className="mb-3 rounded-lg overflow-hidden aspect-[16/9]">
                  <Image
                    src={imageUrl}
                    alt={p.title}
                    width={1200}
                    height={675}
                    className="w-full h-full object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority={false}
                    unoptimized
                  />
                </div>
              ) : (
                <div className="mb-3 rounded-lg overflow-hidden aspect-[16/9] bg-neutral-200 flex items-center justify-center text-neutral-500 text-sm">
                  No Image
                </div>
              )}
              <Link href={`/blog/${p.slug}`} className="block">
                <h2 className="text-xl font-medium">{p.title}</h2>
              </Link>
              {p.description && (
                <p className="text-neutral-600 mt-1 line-clamp-3">{p.description}</p>
              )}
              <div className="mt-2 text-sm text-neutral-500">
                {p.publishedAt ? format(new Date(p.publishedAt), "yyyy年MM月dd日") : "-"}
              </div>
              {p.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border px-2 py-0.5 text-xs text-neutral-600"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} basePath="/blog" />
    </div>
  );
}
