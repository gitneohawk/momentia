// src/app/purchase/[slug]/page.tsx
import React from "react";

export const runtime = "nodejs"; // 画像URL直叩きなどサーバフェッチ想定
export const dynamic = "force-dynamic";

type Item = {
  slug: string;
  width: number;
  height: number;
  caption?: string | null;
  keywords: string[];
  priceDigitalJPY: number;
  urls: { thumb: string | null; large: string | null; original: string; watermarked: string };
};

async function fetchItem(slug: string): Promise<Item | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/photo/${slug}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function PurchasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await fetchItem(slug);

  if (!item) {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-xl font-semibold mb-3">Not found</h1>
        <p className="text-sm text-neutral-600">この写真は見つからないか、非公開です。</p>
      </section>
    );
  }

  const mp = Math.round(((item.width * item.height) / 1_000_000) * 10) / 10;

  return (
    <section className="grid gap-8 max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase</h1>
          <p className="text-sm text-neutral-600">デジタルダウンロード（個人利用）</p>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* プレビュー */}
        <div className="rounded-2xl overflow-hidden bg-neutral-100 ring-1 ring-black/10">
          <img
            src={item.urls.watermarked ?? item.urls.large ?? item.urls.original}
            alt={item.slug}
            className="w-full h-auto block"
            loading="eager"
            decoding="async"
          />
        </div>

        {/* 情報 & CTA */}
        <div className="grid gap-5">
          <div>
            <h2 className="text-lg font-medium">{item.caption || item.slug}</h2>
            {item.keywords?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.keywords.slice(0, 12).map((k) => (
                  <span key={k} className="text-[11px] px-2 py-1 rounded-full bg-neutral-200/70">
                    #{k}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-1 text-sm">
            <div className="text-neutral-700">
              解像度: {item.width}×{item.height} px（約{mp}MP）
            </div>
            <div className="text-neutral-700">形式: JPEG（sRGB）</div>
            <div className="text-neutral-700">想定用途: 個人利用（壁紙・個人プリント等）</div>
          </div>

          <div className="pt-2 border-t">
            <div className="text-2xl font-semibold">
              ¥{item.priceDigitalJPY.toLocaleString()}
              <span className="text-sm text-neutral-500 ml-2">税込</span>
            </div>
          </div>

          <div className="flex gap-3">
            <form action={`/purchase/${item.slug}/checkout`} method="post" className="contents">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-black text-white px-5 py-2.5 text-sm font-semibold shadow hover:shadow-md active:scale-[0.99] transition"
              >
                購入手続きへ（仮）
              </button>
            </form>
            <a
              href="/gallery"
              className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm"
            >
              ギャラリーに戻る
            </a>
          </div>

          <div className="text-xs text-neutral-500 leading-relaxed">
            個人利用の範囲でご利用いただけます。再配布・再販売・商用利用は別途ライセンスが必要です。
            高解像度ファイルには透かしは入りません。詳細は利用規約をご確認ください。
          </div>
        </div>
      </div>
    </section>
  );
}