import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";

const formatDate = (d?: Date | null) =>
  d ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(d) : "—";

const estimateReadingMinutes = (mdx?: string) => {
  if (!mdx) return 1;
  const roughText = mdx
    .replace(/```[\s\S]*?```/g, " ")   // code fences
    .replace(/`[^`]*`/g, " ")          // inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ") // images
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")  // links
    .replace(/[#>*_~`>-]/g, " ")           // markdown tokens
    .replace(/\s+/g, " ")
    .trim();
  const words = roughText ? roughText.split(" ").length : 0;
  return Math.max(1, Math.round(words / 400)); // 400 wpm (日本語は英語より遅め換算)
};

export const revalidate = 300;

interface BlogPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BlogPageProps) {
  const { slug } = await params;
  const post = await prisma.post.findUnique({
    where: { slug },
    select: { title: true, description: true, published: true, heroPath: true }
  });
  if (!post || !post.published) return {};
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const image = post.heroPath ? `${base}/api/blog/image/${post.heroPath}` : undefined;
  return image
    ? {
        title: post.title,
        description: post.description ?? undefined,
        openGraph: {
          title: post.title,
          description: post.description ?? undefined,
          images: [{ url: image }],
        },
        twitter: {
          card: "summary_large_image",
          title: post.title,
          description: post.description ?? undefined,
          images: [image],
        },
      } as const
    : {
        title: post.title,
        description: post.description ?? undefined,
        openGraph: {
          title: post.title,
          description: post.description ?? undefined,
        },
        twitter: {
          card: "summary",
          title: post.title,
          description: post.description ?? undefined,
        },
      } as const;
}

export default async function BlogPostPage({ params }: BlogPageProps) {
  const { slug } = await params;

  const post = await prisma.post.findUnique({
    where: { slug },
    select: { id: true, title: true, description: true, bodyMdx: true, published: true, publishedAt: true },
  });
  if (!post || !post.published) notFound();

  const readMins = estimateReadingMinutes(post.bodyMdx);

  const prev = await prisma.post.findFirst({
    where: { published: true, publishedAt: { lt: post.publishedAt! } },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true },
  });
  const next = await prisma.post.findFirst({
    where: { published: true, publishedAt: { gt: post.publishedAt! } },
    orderBy: { publishedAt: "asc" },
    select: { slug: true, title: true },
  });

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link href="/blog" className="text-sm text-neutral-500 hover:text-neutral-700">
          ← ブログに戻る
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">{post.title}</h1>
        {post.description && (
          <p className="text-neutral-600 leading-relaxed">{post.description}</p>
        )}
        <div className="mt-3 text-sm text-neutral-500">
          公開日: {formatDate(post.publishedAt)} ・ 読了目安: 約{readMins}分
        </div>
      </header>

      <div className="prose prose-neutral max-w-none">
        <MDXRemote source={post.bodyMdx} />
      </div>
      <hr className="my-12" />
      <nav className="flex justify-between text-sm">
        {prev ? (
          <Link href={`/blog/${prev.slug}`} className="text-neutral-600 hover:text-neutral-800">
            ← {prev.title}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/blog/${next.slug}`} className="text-neutral-600 hover:text-neutral-800 ml-auto">
            {next.title} →
          </Link>
        ) : <span />}
      </nav>
    </article>
  );
}