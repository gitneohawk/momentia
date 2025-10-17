// Next.js & React のインポート
import Link from "next/link";
import Image from "next/image";

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

export const revalidate = 60;

async function getFeatured(): Promise<Item[]> {
  // Determine base URL depending on environment
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://www.momentia.photo"
      : "http://localhost:3000";

  // API を並列フェッチ（どちらかが失敗しても片方を使う）
  const [featResult, recentResult] = await Promise.allSettled([
    // { cache: "force-cache" } を ISR の設定に合わせる
    fetch(`${baseUrl}/api/photos?featured=1&limit=3`, { next: { revalidate: 60 } }),
    fetch(`${baseUrl}/api/photos?limit=3`, { next: { revalidate: 60 } }),
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

  return items.slice(0, 3);
}

export default async function Home() {
  const featured = await getFeatured();

  return (
    <main className="bg-neutral-50">

      {/* Featured Works: ホバーエフェクトとデザインを更新 */}
      <section className="hidden md:block py-6 sm:py-8 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <header className="mb-8 md:mb-8">
            <h2 className="font-serif text-3xl md:text-4xl font-medium text-neutral-900">
              Featured Works
            </h2>
          </header>

          <div className="-m-2 flex flex-wrap">
            {featured.map((p) => {
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