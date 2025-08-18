"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

type HeroItem = {
  slug: string;
  width: number;
  height: number;
  caption?: string | null;
  urls: { original: string; large: string | null; thumb: string | null };
};

export default function Home() {
  const [hero, setHero] = useState<HeroItem | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/photos", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        const first: HeroItem | undefined = json?.items?.[0];
        if (alive && first) setHero(first);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="grid gap-12 md:grid-cols-2 items-center">
      <div className="space-y-6">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-neutral-800">Momentia</h1>
        <p className="text-neutral-600 leading-relaxed">
          瞬間が生きる場所。風景や花のマクロを中心に、写真を美しく展示し、将来的にはデジタル販売やプリントにも対応していく予定です。
        </p>
        <div className="flex gap-3">
          <Link
            href="/gallery"
            className="rounded-md border border-neutral-900 px-4 py-2 text-sm hover:bg-neutral-900 hover:text-white transition"
          >
            View Gallery
          </Link>
          <Link
            href="/admin/upload"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 transition"
          >
            Admin Upload
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-200 ring-1 ring-black/5 shadow-md">
        {hero?.urls?.large ? (
          <Image
            src={hero.urls.large || hero.urls.original}
            alt={hero.caption || hero.slug}
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        ) : null}
        {/* overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0" />
        {/* caption & CTA overlay */}
        <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white/95 text-sm md:text-base font-medium line-clamp-2 drop-shadow">
              {hero?.caption ?? "今日の一枚"}
            </div>
          </div>
          {hero ? (
            <Link
              href={`/purchase/${hero.slug}`}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-lg bg-white/95 text-black px-3 py-1.5 text-sm font-semibold shadow hover:shadow-md hover:bg-white active:scale-[0.99] transition"
            >
              Purchase
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
