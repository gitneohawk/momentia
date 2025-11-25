import { prisma } from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const photo = await prisma.photo.findUnique({
    where: { slug, published: true },
    include: {
      keywords: true,
      photographer: true,
    },
  });

  if (!photo) {
    const title = "Photo not found – Momentia";
    const description = "指定された作品は公開されていません。";
    return {
      title,
      description,
      openGraph: {
        title,
        description,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  }

  const title = photo.title?.trim() || "Untitled";
  const caption = photo.caption?.trim() || null;

  const keywordWords = photo.keywords?.map((k) => k.word) ?? [];
  const description =
    caption ||
    (keywordWords.length > 0
      ? `静かな空間に合うアート写真。${keywordWords.join(" / ")} のテーマで撮影した作品です。`
      : "光と時間をテーマにしたアート写真。Momentiaの作品ページです。");

  const ogImageUrl = `https://www.momentia.photo/api/og?slug=${encodeURIComponent(slug)}`;

  return {
    title: `${title} – Momentia`,
    description,
    openGraph: {
      title: `${title} – Momentia`,
      description,
      images: [{ url: ogImageUrl }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} – Momentia`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function PhotoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const photo = await prisma.photo.findUnique({
    where: { slug, published: true },
    include: {
      photographer: true,
      keywords: true,
    },
  });

  if (!photo) {
    return (
      <div className="px-6 py-20 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold">Photo not found</h1>
        <p className="text-neutral-600 mt-4">
          指定された作品は公開されていないか、削除された可能性があります。
        </p>
      </div>
    );
  }

  const title = photo.title?.trim() || "Untitled";
  const caption = photo.caption?.trim() || null;

  return (
    <div className="px-4 py-12 max-w-5xl mx-auto">
      <div className="w-full max-w-4xl mb-6">
        <Link
          href="/gallery"
          className="text-sm text-blue-600 hover:underline"
        >
          ← ギャラリーに戻る
        </Link>
      </div>
      <div className="flex flex-col items-center">
        <div className="relative w-full max-w-4xl aspect-auto">
          <Image
            src={`/api/wm/${slug}?w=2048`}
            alt={title}
            width={2048}
            height={2048}
            className="rounded-xl"
            priority
          />
        </div>

        <h1 className="text-2xl font-semibold mt-6">{title}</h1>

        {photo.photographer && (
          <p className="text-sm text-neutral-600 mt-1">
            Photographer:{" "}
            {photo.photographer.displayName ||
              photo.photographer.name ||
              "Unknown"}
          </p>
        )}

        {caption && (
          <p className="text-sm text-neutral-700 mt-3 max-w-3xl text-center">
            {caption}
          </p>
        )}

        {photo.keywords && photo.keywords.length > 0 && (
          <p className="text-sm text-neutral-500 mt-4">
            Keywords: {photo.keywords.map((k) => k.word).join(", ")}
          </p>
        )}

        <div className="mt-8">
          <Link
            href={`/purchase/${encodeURIComponent(slug)}`}
            className="inline-flex items-center px-4 py-2 bg-black text-white text-sm rounded-md hover:bg-neutral-800 transition"
          >
            購入ページを開く
          </Link>
        </div>
      </div>
    </div>
  );
}