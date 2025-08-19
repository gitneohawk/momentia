import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";

interface BlogPageProps {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostPage({ params }: BlogPageProps) {
  const { slug } = await params;

  const post = await prisma.post.findUnique({
    where: { slug },
  });

  if (!post || !post.published) {
    notFound();
  }

  return (
    <article className="prose mx-auto p-6">
      <h1 className="mb-2">{post.title}</h1>
      {post.description && <p className="text-gray-600">{post.description}</p>}
      {post.heroPath && (
        <img src={post.heroPath} alt={post.title} className="my-4 rounded" />
      )}
      <div className="text-sm text-gray-500 mb-6">
        Published at {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "—"}
      </div>
      <MDXRemote source={post.bodyMdx} />
    </article>
  );
}