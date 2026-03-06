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
    slug: "momentia-46",
    reason: "「会話を待つ椅子たち」というタイトルが示す通り、応接室・会議室に置いたとき、訪問者の緊張をほぐしながら場の格を高める一枚。",
    tags: ["応接室", "会議室", "椅子", "静寂"],
  },
  {
    slug: "momentia-38",
    reason: "「思考のリズムを静かに並べた本棚」は社長室の知的権威を自然に演出する。過剰な主張がなく、来客に安心感と信頼を与える。",
    tags: ["社長室", "本棚", "知性", "落ち着き"],
  },
  {
    slug: "momentia-37",
    reason: "静止した時計が「時間を支配する」という経営者のイメージと重なる。会議室の正面壁など、視線が集まる場所に最適。",
    tags: ["社長室", "会議室", "時計", "緊張感"],
  },
  {
    slug: "momentia-53",
    reason: "建築的な格子構造が空へ向かう静かなリズムを描く。企業の秩序・上昇感・誠実さを空間に添えるための一枚。",
    tags: ["応接室", "会議室", "建築", "秩序"],
  },
  {
    slug: "momentia-43",
    reason: "都市の光と影が交差する線は、ビジネス空間の洗練されたアクセントになる。モノクロに近い色調がどんな内装にも馴染む。",
    tags: ["応接室", "社長室", "都市", "モノクロ調"],
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

export default async function OfficeLpPage() {
  const baseUrl = getBaseUrl();
  const isProd = process.env.NODE_ENV === "production";
  const results = await Promise.all(PICKS.map((pick) => fetchPick(pick, baseUrl)));

  const hero = results.find((r) => r.pick.slug === "momentia-46") ?? results[0];
  const heroTitle = hero?.item?.title || hero?.item?.caption || hero?.pick.slug;
  const heroImgSrc =
    hero?.item?.urls.thumbWebp ??
    hero?.item?.urls.thumb ??
    hero?.item?.urls.watermarked ??
    hero?.item?.urls.large ??
    null;

  return (
    <main className="bg-neutral-50">
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 lg:py-14 pb-24 sm:pb-0 grid gap-8">
        <header className="grid gap-4">
          <p className="text-sm sm:text-base font-medium text-neutral-500">
            社長室・応接室・会議室。その壁が、場の格をつくる。
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            オフィス空間のための5作品
          </h1>
          <p className="text-base text-neutral-600 leading-relaxed max-w-3xl">
            初めて訪れるクライアントが部屋に入った瞬間、壁に飾られた一枚が場の印象を決めます。
            雑然としていても、殺風景でもなく——静かに格を示す写真が、信頼の空気をつくります。
            <br />
            <br />
            このページでは、社長室・応接室・会議室という用途を念頭に、
            「主張しすぎず、しかし確かな存在感を放つ」5作品だけを選定しています。
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
                応接室・会議室に最もなじむ一枚から。
                「会話を待つ椅子」という静けさが、訪問者の緊張をほぐしながら場の格を静かに高めます。
              </p>
              <Link
                href={`/purchase/${encodeURIComponent(hero.pick.slug)}`}
                prefetch={false}
                className="inline-flex w-fit items-center justify-center rounded-full bg-black text-white text-base px-6 py-3 hover:bg-neutral-800 transition"
              >
                サイズと価格を見る
              </Link>
            </div>
          </div>
        </section>

        {/* 5 picks */}
        <section className="grid gap-4">
          <h2 className="text-lg font-semibold text-neutral-900">用途に合わせて選べる5作品</h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                      サイズと価格を見る
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

        {/* Mobile sticky CTA (for ad traffic) */}
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-50 bg-white/90 backdrop-blur border-t border-black/5">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-xs leading-tight">
              <div className="font-medium text-neutral-900">A4 / A3 / A2 写真パネル</div>
              <div className="text-neutral-600">22,000円〜</div>
            </div>
            <Link
              href={`/purchase/${encodeURIComponent(hero.pick.slug)}`}
              prefetch={false}
              className="inline-flex items-center justify-center rounded-full bg-black text-white text-sm px-4 py-2.5 hover:bg-neutral-800 transition whitespace-nowrap"
            >
              サイズと価格を見る
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
