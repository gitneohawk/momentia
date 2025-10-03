// src/app/purchase/[slug]/page.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";

export const runtime = "nodejs"; // 画像URL直叩きなどサーバフェッチ想定（ページ自体はCSR）
export const dynamic = "force-dynamic";

type Item = {
  slug: string;
  width: number;
  height: number;
  caption?: string | null;
  keywords: string[];
  priceDigitalJPY: number;
  pricePrintA2JPY?: number;
  sellDigital?: boolean;
  sellPanel?: boolean;
  urls: { thumb: string | null; large: string | null; original: string; watermarked: string };
};

export default function PurchasePage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");

  const [variant, setVariant] = useState<"digital" | "print_a2">("digital");
  const priceDigital = item?.priceDigitalJPY ?? 11000; // fallback to 10,000 JPY
  const pricePrintA2 = item?.pricePrintA2JPY ?? 55000; // fallback to 50,000 JPY

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await params;
        if (mounted) setSlug(p?.slug ?? null);
      } catch {
        if (mounted) setSlug(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    const s = slug; // snapshot for narrowing
    let aborted = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/photo/${encodeURIComponent(s)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`fetch /api/photo/${s} -> ${res.status}`);
        const json: Item = await res.json();
        if (!aborted) setItem(json ?? null);
      } catch (e: any) {
        console.error("[purchase] client fetch failed", e);
        if (!aborted) setError(e?.message ?? "fetch failed");
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    load();
    return () => {
      aborted = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!item) return;
    const rawD = item.sellDigital;
    const rawP = item.sellPanel;
    const flagsProvided = rawD !== undefined || rawP !== undefined;
    const d = flagsProvided ? !!rawD : true;
    const p = flagsProvided ? !!rawP : true;
    if (d && !p) setVariant("digital");
    else if (!d && p) setVariant("print_a2");
    // if both true or both false, keep current selection
  }, [item]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("checkoutEmail");
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  const mp = useMemo(() => {
    if (!item) return 0;
    return Math.round(((item.width * item.height) / 1_000_000) * 10) / 10;
  }, [item]);

  // フラグ未設定（両方undefined）の場合は後方互換で両方許可。
  const rawD = item?.sellDigital;
  const rawP = item?.sellPanel;
  const flagsProvided = rawD !== undefined || rawP !== undefined;
  const canDigital = flagsProvided ? !!rawD : true;
  const canPanel = flagsProvided ? !!rawP : true;
  const hasAnyPurchase = canDigital || canPanel;

  if (loading || !slug) {
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
        <div className="h-6 w-28 bg-neutral-200 rounded animate-pulse mb-6" />
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <div className="aspect-[4/3] w-full rounded-2xl bg-neutral-200 animate-pulse" />
          <div className="grid gap-4">
            <div className="h-5 w-40 bg-neutral-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-neutral-200 rounded animate-pulse" />
            <div className="h-10 w-32 bg-neutral-200 rounded animate-pulse mt-4" />
          </div>
        </div>
      </section>
    );
  }

  if (error || !item) {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-xl font-semibold mb-3">Not found</h1>
        <p className="text-sm text-neutral-600">この写真は見つからないか、非公開です。</p>
      </section>
    );
  }

  return (
    <section className="grid gap-8 max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase</h1>
          <p className="text-sm text-neutral-600">デジタル / パネルを選択して購入</p>
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
            <div className="text-neutral-700">形式: JPEG（sRGB）</div>
            <div className="text-neutral-700">デジタル: 長辺2400px（個人利用・商用利用可）</div>
            <div className="text-neutral-700">想定用途: 個人利用（壁紙・個人プリント等）</div>
            <div className="text-neutral-700">A2パネル: プロラボで高品質プリントし白枠パネル仕上げ</div>
          </div>

          {/* バリアント選択 */}
          <div className="grid gap-3 pt-2 border-t">
            {/* 購入者メール（許可されたメールのみ購入可：環境変数 ALLOWED_CHECKOUT_EMAILS） */}
            <div className="grid gap-1">
              <label className="text-sm text-neutral-700" htmlFor="checkout-email">メールアドレス</label>
              <input
                id="checkout-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
              <p className="text-xs text-neutral-500">※ テスト中は許可されたメールアドレスのみ購入可能です。</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {canDigital && (
                <button
                  type="button"
                  onClick={() => setVariant("digital")}
                  className={`text-left rounded-xl border px-4 py-3 ${
                    variant === "digital" ? "border-black ring-1 ring-black" : "border-neutral-300"
                  }`}
                >
                  <div className="font-medium">デジタル（商用可）</div>
                  <div className="text-sm text-neutral-600">JPEG / 個人・商用利用可（規約順守）</div>
                  <div className="mt-1 text-lg font-semibold">
                    ¥{priceDigital.toLocaleString()} <span className="text-sm text-neutral-500 ml-1">（税込）</span>
                  </div>
                </button>
              )}

              {canPanel && (
                <button
                  type="button"
                  onClick={() => setVariant("print_a2")}
                  className={`text-left rounded-xl border px-4 py-3 ${
                    variant === "print_a2" ? "border-black ring-1 ring-black" : "border-neutral-300"
                  }`}
                >
                  <div className="font-medium">A2 プロプリント（パネル）</div>
                  <div className="text-sm text-neutral-600">送料込 / 額装なし / 工房プリント</div>
                  <div className="mt-1 text-lg font-semibold">
                    ¥{pricePrintA2.toLocaleString()} <span className="text-sm text-neutral-500 ml-1">（送料込み、税込）</span>
                  </div>
                </button>
              )}

              {!hasAnyPurchase && (
                <div className="col-span-2 text-sm text-red-600">
                  現在この写真は販売を停止しています。
                </div>
              )}
            </div>

            {hasAnyPurchase && (
              <div className="flex items-center justify-between mt-1">
                <div className="text-sm text-neutral-600">
                  {variant === "digital" ? "デジタルファイルのダウンロード（商用可）" : "A2サイズのプリント・パネルを配送"}
                </div>
                <div className="text-2xl font-semibold">
                  ¥{(variant === "digital" ? priceDigital : pricePrintA2).toLocaleString()}
                  <span className="text-sm text-neutral-500 ml-2">
                    {variant === "print_a2" ? "（送料込み、税込）" : "（税込）"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* CTA */}
<div className="flex gap-3">
  <button
    type="button"
    onClick={async () => {
      if (!email || !email.includes("@")) {
        alert("メールアドレスを入力してください。");
        return;
      }
      if ((variant === "digital" && !canDigital) || (variant === "print_a2" && !canPanel)) {
        alert("現在このバリアントは購入できません。");
        return;
      }
      try { localStorage.setItem("checkoutEmail", email); } catch {}
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemType: variant === "digital" ? "digital" : "panel",
            name: variant === "digital" ? `${item.slug}（デジタル）` : `${item.slug}（A2パネル）`,
            amountJpy: variant === "digital" ? priceDigital : pricePrintA2,
            slug: item.slug,
            customerEmail: email,
          }),
        });
        if (!res.ok) throw new Error(`Checkout API error: ${res.status}`);
        const { url } = await res.json();
        if (url) window.location.href = url;
      } catch (e) {
        console.error("Checkout error", e);
        alert("購入手続きに失敗しました。");
      }
    }}
    className="inline-flex items-center justify-center rounded-xl bg-black text-white px-5 py-2.5 text-sm font-semibold shadow hover:shadow-md active:scale-[0.99] transition"
  >
    購入手続きへ
  </button>

  <a
    href="/gallery"
    className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm"
  >
    ギャラリーに戻る
  </a>
</div>

          {variant === "digital" && (
            <div className="text-xs text-neutral-500 leading-relaxed">
              購入者（個人・法人）は自らの活動や業務において、本画像を商用利用を含めてご利用いただけます。
              再配布・再販売・第三者への譲渡、商品化（二次販売目的のグッズ等への使用）は禁止されます。
              高解像度ファイルには透かしは入りません。詳細は利用規約をご確認ください。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}