import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";

export const revalidate = 300;

interface BlogPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BlogPageProps) {
  const { slug } = await params;
  const post = await prisma.post.findUnique({ where: { slug }, select: { title: true, description: true, published: true } });
  if (!post || !post.published) return {};
  return {
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
    select: { title: true, description: true, bodyMdx: true, published: true, publishedAt: true },
  });
  if (!post || !post.published) notFound();

  return (
    <article className="prose mx-auto p-6">
      <h1 className="mb-2">{post.title}</h1>
      {post.description && <p className="text-gray-600">{post.description}</p>}
      <div className="text-sm text-gray-500 mb-6">
        Published at {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "—"}
      </div>
      <MDXRemote source={post.bodyMdx} />
    </article>
  );
}