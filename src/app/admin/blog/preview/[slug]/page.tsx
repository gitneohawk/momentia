import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blogMdxComponents } from "@/components/blogMdxComponents";

const formatDate = (d?: Date | null) =>
  d ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(d) : "—";

const estimateReadingMinutes = (mdx?: string) => {
  if (!mdx) return 1;
  const roughText = mdx
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/[#>*_~`>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = roughText ? roughText.split(" ").length : 0;
  return Math.max(1, Math.round(words / 400));
};

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 0;

export default async function AdminBlogPreviewPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminEmail(session.user?.email ?? "")) {
    notFound();
  }
  const { slug } = await params;
  const post = await prisma.post.findUnique({
    where: { slug },
    select: {
      title: true,
      description: true,
      bodyMdx: true,
      published: true,
      publishedAt: true,
    },
  });

  if (!post) {
    notFound();
  }

  const readMins = estimateReadingMinutes(post.bodyMdx);

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/admin/blog/${slug}`} className="text-sm text-neutral-500 hover:text-neutral-700">
          ← 編集ページに戻る
        </Link>
        <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
          プレビュー表示（公開状態: {post.published ? "公開" : "下書き"}）
        </span>
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
        <MDXRemote source={post.bodyMdx ?? ""} components={blogMdxComponents} />
      </div>
    </article>
  );
}
