// src/app/purchase/success/page.tsx
import { headers } from "next/headers";

type PhotoItem = {
  slug: string;
  caption?: string | null;
  urls: {
    thumb: string | null;
    large: string | null;
    original: string;
    watermarked: string;
  };
};

export default async function PurchaseSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const slug = (sp?.slug as string | undefined) ?? undefined;
  const sessionId = (sp?.session_id as string | undefined) ?? undefined;

  let item: PhotoItem | null = null;
  if (slug) {
    const hdrs = await headers();
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? `http://${hdrs.get("host")}`;
    try {
      const res = await fetch(`${base}/api/photos?kw=${encodeURIComponent(slug)}&limit=1`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as { items?: PhotoItem[] };
        item = (json?.items && json.items.length > 0) ? json.items[0] : null;
      }
    } catch {}
  }

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 grid gap-6">
      <h1 className="text-2xl font-semibold">ご購入ありがとうございます</h1>
      {sessionId ? (
        <p className="text-sm text-neutral-600">
          注文ID: <span className="font-mono">{sessionId}</span>
        </p>
      ) : null}

      {slug && item && (
        <div className="grid gap-4">
          <div className="rounded-xl overflow-hidden bg-neutral-100 ring-1 ring-black/10">
            <img
              src={item.urls.watermarked ?? item.urls.large ?? item.urls.original}
              alt={item.slug}
              className="w-full h-auto"
            />
          </div>
          <p className="text-neutral-700">{item.caption || item.slug}</p>
        </div>
      )}

      {/* {slug && !item && (
        <div>
          <h2 className="text-lg font-medium mb-1">Not found</h2>
          <p className="text-sm text-neutral-600">この写真は見つからないか、非公開です。</p>
        </div>
      )} */}

      <div className="grid gap-2 text-sm text-neutral-700">
        <p>・デジタル商品: 決済確認後、ダウンロードリンクをメールでお送りします（準備中）。</p>
        <p>・パネル商品: ご入力いただいた住所に発送します。準備が整い次第、メールでご連絡します。</p>
      </div>

      <div className="pt-2">
        <a
          href="/gallery"
          className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm"
        >
          ギャラリーへ戻る
        </a>
      </div>
    </section>
  );
}