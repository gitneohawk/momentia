import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { Metadata } from "next";
import Image from "next/image";

export const runtime = "nodejs"; // FSを使う
export const dynamic = "force-dynamic"; // 下書きでも即反映（必要に応じて外してOK）

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

type FrontMatter = {
  title?: string;
  description?: string;
  date?: string | Date;
  hero?: string;
  tags?: string[];
};

async function readPost(slug: string) {
  const file = path.join(BLOG_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(file, "utf8");
  const { content, data } = matter(raw);
  return { content, front: (data || {}) as FrontMatter };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { front } = await readPost(slug);
    return {
      title: front.title ?? slug,
      description: front.description ?? "Momentia Blog",
      openGraph: front.hero
        ? { title: front.title ?? slug, description: front.description ?? "Momentia Blog", images: [{ url: front.hero }] }
        : undefined,
    };
  } catch {
    return { title: "Not found" };
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let post: { content: string; front: FrontMatter } | null = null;
  try {
    post = await readPost(slug);
  } catch (e) {
    post = null;
  }

  if (!post) {
    return (
      <section className="px-4 sm:px-6 max-w-3xl mx-auto py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
        <p className="text-neutral-600 mt-2">記事が見つかりませんでした。</p>
      </section>
    );
  }

  const { content, front } = post;
  const dateText =
  front.date
    ? (typeof front.date === "string"
        ? front.date
        : new Date(front.date as Date).toISOString().slice(0, 10)) // YYYY-MM-DD
    : undefined;

  return (
    <article className="prose prose-neutral prose-lg md:prose-xl
                    max-w-3xl mx-auto px-4 sm:px-6 py-12
                    [--tw-prose-links:theme(colors.blue.600)]
                    hover:prose-a:underline underline-offset-2">
      <header className="not-prose mb-8 space-y-2">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-neutral-900">{front.title ?? slug}</h1>
        {front.description && <p className="text-neutral-600">{front.description}</p>}
        {dateText && <p className="text-sm text-neutral-500">{dateText}</p>}
      </header>
     {front.hero && (
  <figure className="my-8">
    <Image
      src={front.hero}             // 例: /og/guide-decor.jpg（public 配下）
      alt={front.title ?? ""}
      width={1200}
      height={630}
      className="w-full h-auto rounded-lg shadow"
      priority
    />
  </figure>
)}
      <div className="max-w-none">
        <MDXRemote
          source={content}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
              rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: "wrap" }]],
            },
          }}
        />
      </div>
    </article>
  );
}