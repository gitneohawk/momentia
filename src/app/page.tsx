"use client";

// Next.js & React のインポート
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import Head from "next/head";
// import ComingSoon from "@/components/ComingSoon";

// アニメーションライブラリのインポート
import { motion } from "framer-motion";

// 型定義
type Item = {
  slug: string;
  width: number;
  height: number;
  caption: string | null;
  capturedAt: string | null;
  keywords: string[];
  urls: { thumb: string | null; large: string | null; original: string };
};

export default function Home() {
  const [featured, setFeatured] = useState<Item[]>([]);

  useEffect(() => {
    (async () => {
      // API を並列フェッチ（どちらかが失敗しても片方を使う）
      const [featResult, recentResult] = await Promise.allSettled([
        fetch("/api/photos?featured=1&limit=3", { cache: "force-cache" }),
        fetch("/api/photos?limit=3", { cache: "force-cache" }),
      ]);

      let items: Item[] = [];

      if (featResult.status === "fulfilled") {
        try {
          const json = await featResult.value.json();
          if (Array.isArray(json.items) && json.items.length > 0) {
            items = json.items as Item[];
          }
        } catch {}
      }

      if (items.length === 0 && recentResult.status === "fulfilled") {
        try {
          const json = await recentResult.value.json();
          if (Array.isArray(json.items) && json.items.length > 0) {
            items = json.items as Item[];
          }
        } catch {}
      }

      setFeatured(items.slice(0, 3));
    })();
  }, []);

  return (
    <main className="bg-neutral-50">
      <Head>
        <link rel="preload" as="image" href="/hero-image.webp" />
      </Head>
      {/* Hero: 背景画像とアニメーションを追加 */}
      <section className="relative h-[58vh] md:h-[60vh] min-h-[600px] flex items-center justify-center text-center text-white overflow-hidden">
        {/* 背景画像: publicフォルダからのパスを指定してください */}
        <Image
          src="/hero-image.webp"
          alt="Hero background"
          fill
          sizes="100vw"
          className="object-cover z-0"
          priority
        />
        {/* 背景オーバーレイ */}
        <div className="absolute inset-0 bg-black/30 z-10" />

        {/* 背景グレインテクスチャ */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-15 z-20"
          style={{
            backgroundImage: "url(/textures/grain.png)",
            backgroundSize: "300px 300px",
            mixBlendMode: "overlay",
          }}
        />

        {/* コンテンツ */}
        <div className="relative z-30 px-4">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            // tailwind.config.jsで設定したセリフ体フォントを適用
            className="font-serif text-4xl md:text-6xl font-medium tracking-tight text-white drop-shadow-md"
          >
            Momentia
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="mt-4 text-lg md:text-xl text-neutral-200 max-w-2xl mx-auto drop-shadow"
          >
            光と時間の呼吸を、そっと壁に。— 静けさを連れてくる写真たち。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
            className="mt-8 flex flex-wrap gap-4 justify-center"
          >
            <Link
              href="/gallery"
              // ガラスモーフィズム風のデザインに更新
              className="inline-flex items-center rounded-lg border border-white/30 bg-white/20 backdrop-blur-sm px-5 py-2.5 text-base font-medium text-white shadow-sm hover:bg-white/30 transition-colors"
            >
              ギャラリーを見る
            </Link>
            {/* <Link
              href="/purchase/info"
              className="inline-flex items-center rounded-lg px-5 py-2.5 bg-white text-base font-medium text-neutral-900 hover:bg-neutral-200 transition-colors"
            >
              ご購入について
            </Link> */}
          </motion.div>
        </div>
      </section>

      {/* Featured Works: ホバーエフェクトとデザインを更新 */}
      <section className="hidden md:block py-6 sm:py-8 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <header className="mb-8 md:mb-8">
            <h2 className="font-serif text-3xl md:text-4xl font-medium text-neutral-900">
              Featured Works
            </h2>
          </header>

          <div className="-m-2 flex flex-wrap">
            {featured.map((p, index) => {
                const _src = p.urls.thumb || p.urls.large || p.urls.original;
              return (
                <div key={p.slug} className="w-full md:w-1/3 p-2">
                  <Link
                    href={`/gallery?open=${encodeURIComponent(p.slug)}`}
                    prefetch={false}
                    className="group relative block overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-xl transition-shadow duration-300"
                  >
                        <img
                      decoding="async"
                      loading="eager"
                      src={_src}
                      alt={p.caption ?? p.slug}
                      className="h-72 md:h-80 w-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-105"
                    />
                    {/* ホバー時に表示されるグラデーションオーバーレイ */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                      {/* ホバーでキャプションが浮き上がるアニメーション */}
                      <div className="transform transition-transform duration-500 ease-in-out group-hover:-translate-y-2">
                        <p className="text-lg font-medium drop-shadow-md">{p.caption || "—"}</p>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
            {featured.length === 0 && (
              <div className="w-full p-2 text-neutral-500">注目の作品はまだありません。</div>
            )}
          </div>
        </div>
      </section>

       {/* About teaser */}
      <section className="bg-white/60 backdrop-blur-[1px] py-6 sm:py-8 md:py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Link
            href="/about"
            className="group block rounded-2xl border border-black/10 bg-white p-5 sm:p-6 shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
          >
            <div className="flex items-start gap-5">
              <div className="shrink-0 ring-1 ring-black/10 overflow-hidden w-14 h-14 flex items-center justify-center">
                {/* ロゴやポートレートを置く場合は /public/logos/Evoluzio_Logo.png を利用 */}
                <Image
                  src="/logos/Evlogo.jpg"
                  alt="Evoluzio Inc."
                  width={40}
                  height={40}
                  className="opacity-80"
                />
              </div>
              <div className="min-w-0">
                <h3 className="font-serif text-2xl font-medium tracking-tight text-neutral-900">
                  Momentiaについて
                </h3>
                <p className="mt-2 text-neutral-600 leading-relaxed">
                  Momentia は Evoluzio Inc. が運営する写真レーベル。詳しくはプロフィールページへ。
                </p>
                <div className="mt-4 inline-flex items-center gap-2 text-neutral-900 font-medium">
                  もっと見る
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </section>
      
    </main>
  );
}