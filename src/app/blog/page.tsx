import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import Pagination from "@/components/Pagination";

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
    },
  });

  return (
    <div className="px-4 sm:px-6 max-w-3xl mx-auto py-10">
      <h1 className="text-3xl font-semibold mb-6">Blog</h1>

      <div className="space-y-6">
        {posts.map((p) => (
          <article
            key={p.id}
            className="rounded-2xl border p-5 hover:shadow-md transition-shadow"
          >
            <Link href={`/blog/${p.slug}`} className="block">
              <h2 className="text-xl font-medium">{p.title}</h2>
            </Link>
            {p.description && (
              <p className="text-neutral-600 mt-1">{p.description}</p>
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
        ))}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} basePath="/blog" />
    </div>
  );
}