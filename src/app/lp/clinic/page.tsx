import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = {
  slug: string;
  title?: string | null;
  caption?: string | null;
  urls: {
    thumbWebp?: string | null;
    thumb: string | null;
    large: string | null;
    watermarked?: string | null;
  };
};

const PICKS = [
  {
    slug: "momentia-67",
    reason: "刺激を増やさず、視線を遠くへ逃がすために選定。",
    tags: ["刺激少", "抽象", "人物なし"],
  },
  {
    slug: "momentia-59",
    reason: "視線が自然に流れ、待つ時間の体感を整えるために選定。",
    tags: ["視線の流れ", "抽象", "人物なし"],
  },
  {
    slug: "momentia-61",
    reason: "清潔感のある光で、空間の印象を軽くするために選定。",
    tags: ["清潔感", "寒色", "人物なし"],
  },
] as const;

function getBaseUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return siteUrl.replace(/\/+$/, "");

  return process.env.NODE_ENV === "production" ? "https://www.momentia.photo" : "http://localhost:3000";
}

type PickResult = {
  pick: (typeof PICKS)[number];
  item: Item | null;
  error: boolean;
};

async function fetchPick(pick: (typeof PICKS)[number], baseUrl: string): Promise<PickResult> {
  try {
    const res = await fetch(`${baseUrl}/api/photo/${encodeURIComponent(pick.slug)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch /api/photo/${pick.slug} -> ${res.status}`);
    const json = (await res.json()) as Item;
    return { pick, item: json ?? null, error: false };
  } catch {
    return { pick, item: null, error: true };
  }
}

export default async function DentalLpPage() {
  const baseUrl = getBaseUrl();
  const isProd = process.env.NODE_ENV === "production";
  const results = await Promise.all(PICKS.map((pick) => fetchPick(pick, baseUrl)));

  const hero = results.find((r) => r.pick.slug === "momentia-67") ?? results[0];
  const heroTitle = hero?.item?.title || hero?.item?.caption || hero?.pick.slug;
  const heroImgSrc =
    hero?.item?.urls.thumbWebp ??
    hero?.item?.urls.thumb ??
    hero?.item?.urls.watermarked ??
    hero?.item?.urls.large ??
    null;

  return (
    <main className="bg-neutral-50">
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 lg:py-14 grid gap-8">
        <header className="grid gap-4">
          <p className="text-sm sm:text-base font-medium text-neutral-500">
            待合室の数分が、いちばん緊張する。
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            クリニック待合室のための3作品
          </h1>
          <p className="text-base text-neutral-600 leading-relaxed max-w-3xl">
            クリニックの待合室は、診療前の短い時間に緊張が高まりやすい場所です。
            音や匂い、これからの診療を想像すると、意識は自然と内側へ向かっていきます。
            <br />
            <br />
            このページでは、余計な刺激を増やさず、視線を静かに逃がす写真を
            「クリニック待合室」という用途に限定して、3作品だけ選定しています。
          </p>
        </header>

        {/* FV: Hero */}
        <section className="grid gap-4">
          <div className="rounded-2xl overflow-hidden bg-white ring-1 ring-black/5 shadow-sm">
            <div className="bg-neutral-100 ring-1 ring-black/5 flex items-center justify-center">
              {isProd ? (
                heroImgSrc && !hero.error ? (
                  <img
                    src={heroImgSrc}
                    alt={heroTitle}
                    className="w-full max-h-[520px] object-contain block"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="h-[420px] w-full flex items-center justify-center text-sm text-neutral-500">
                    読み込み失敗
                  </div>
                )
              ) : (
                <div className="h-[420px] w-full flex items-center justify-center text-sm text-neutral-500">
                  開発環境では画像を表示しません（本番で表示されます）
                </div>
              )}
            </div>

            <div className="p-5 sm:p-6 grid gap-3">
              <div className="text-sm text-neutral-500">代表作品</div>
              <div className="text-lg sm:text-xl font-semibold text-neutral-900">{heroTitle}</div>
              <p className="text-base text-neutral-600 leading-relaxed">
                まずは、待合室に置いて最も事故が起きにくい一枚から。
                余計な連想を増やさず、視線を静かに外へ逃がします。
              </p>
              <Link
                href={`/purchase/${encodeURIComponent(hero.pick.slug)}`}
                prefetch={false}
                className="inline-flex w-fit items-center justify-center rounded-full bg-black text-white text-base px-6 py-3 hover:bg-neutral-800 transition"
              >
                この写真を待合室に使う
              </Link>
            </div>
          </div>
        </section>

        {/* 3 picks */}
        <section className="grid gap-4">
          <h2 className="text-lg font-semibold text-neutral-900">用途に合わせて選べる3作品</h2>

          <div className="grid gap-4 md:grid-cols-3">
            {results.map(({ pick, item, error }) => {
              const title = item?.title || item?.caption || pick.slug;
              const imgSrc =
                item?.urls.thumbWebp ??
                item?.urls.thumb ??
                item?.urls.watermarked ??
                item?.urls.large ??
                null;

              return (
                <article
                  key={pick.slug}
                  className="grid gap-4 rounded-2xl bg-white ring-1 ring-black/5 shadow-sm p-4"
                >
                  <div className="rounded-xl overflow-hidden bg-neutral-100 ring-1 ring-black/5 flex items-center justify-center">
                    {isProd ? (
                      imgSrc && !error ? (
                        <img
                          src={imgSrc}
                          alt={title}
                          className="w-full h-[220px] object-cover block"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="h-[220px] w-full flex items-center justify-center text-sm text-neutral-500">
                          読み込み失敗
                        </div>
                      )
                    ) : (
                      <div className="h-[220px] w-full flex items-center justify-center text-sm text-neutral-500">
                        開発環境では画像を表示しません
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <div className="text-base font-semibold text-neutral-900">{title}</div>

                    <div className="flex flex-wrap gap-2">
                      {pick.tags.map((t) => (
                        <span
                          key={t}
                          className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-700 ring-1 ring-black/5"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    <p className="text-sm text-neutral-600 leading-relaxed">{pick.reason}</p>

                    <Link
                      href={`/purchase/${encodeURIComponent(pick.slug)}`}
                      prefetch={false}
                      className="inline-flex w-fit items-center justify-center rounded-full bg-black text-white text-sm px-4 py-2.5 hover:bg-neutral-800 transition"
                    >
                      この写真を待合室に使う
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="pt-2">
          <Link href="/gallery" className="text-sm text-neutral-700 hover:text-black underline underline-offset-4">
            /gallery に戻る
          </Link>
        </div>
      </section>
    </main>
  );
}
