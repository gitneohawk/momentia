// src/app/purchase/success/page.tsx
import { prisma } from "@/lib/prisma";


import Link from "next/link";
// 表示用の型
type OrderSummary = {
  sessionId: string;
  email: string | null;
  slug: string | null;
  itemType: "digital" | "panel" | string | null;
  status: string | null;
  createdAt: Date;
  amountJpy: number | null;
  currency: string | null;
  downloadToken?: string | null;
  metadata?: { [key: string]: unknown } | null;
};

// searchParams から文字列を安全に取得
function getParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string
): string | undefined {
  const v = sp?.[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

export default async function PurchaseSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sessionId = getParam(sp, "session_id");

  // データ取得
  let order: OrderSummary | null = null;
  if (sessionId) {
    order = (await prisma.order.findUnique({
      where: { sessionId },
      select: {
        sessionId: true,
        email: true,
        slug: true,
        itemType: true,
        status: true,
        createdAt: true,
        amountJpy: true,
        currency: true,
        downloadToken: true,
        metadata: true,
      },
    })) as OrderSummary | null;
  }

  // 日時整形（JST）
  const formatDate = (d: Date | undefined) =>
    d ? new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "-";

  const formatJPY = (v: number | null | undefined) =>
    v == null ? "-" : new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(v);

  const panelSize =
    order?.itemType === "panel" && typeof order.metadata?.size === "string"
      ? order.metadata.size
      : null;

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 grid gap-6">
      <h1 className="text-2xl font-semibold">ご購入ありがとうございます</h1>

      {sessionId ? (
        <p className="text-sm text-neutral-600">
          注文ID: <span className="font-mono">{sessionId}</span>
        </p>
      ) : null}

      {/* サマリー表示 */}
      {order ? (
        <div className="grid gap-2 text-[15px]">
          <div className="grid grid-cols-[9rem_1fr] gap-y-1 sm:grid-cols-[10rem_1fr]">
            <div className="text-neutral-500">日時</div>
            <div>{formatDate(order.createdAt)}</div>

            <div className="text-neutral-500">Email</div>
            <div>{order.email ?? "-"}</div>

            <div className="text-neutral-500">種類</div>
            <div>{order.itemType ?? "-"}</div>

            {order.itemType === "panel" && (
              <>
                <div className="text-neutral-500">サイズ</div>
                <div>{panelSize ?? "-"}</div>
              </>
            )}

            <div className="text-neutral-500">金額</div>
            <div>
              {formatJPY(order.amountJpy)}
              {order.itemType === "panel" ? "（送料込み、税込）" : "（税込）"}
            </div>

            <div className="text-neutral-500">Slug</div>
            <div>{order.slug ?? "-"}</div>

            <div className="text-neutral-500">ステータス</div>
            <div>{order.status ?? "-"}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-neutral-700">
          注文情報の取得に失敗しました。時間をおいて再度お試しください。
        </div>
      )}

      {/* デジタル商品のご案内（トークン有り／未発行の両対応） */}
      {order?.itemType === "digital" ? (
        order.downloadToken ? (
          <div className="mt-6 rounded-xl border bg-neutral-50 p-4">
            <h2 className="text-lg font-medium mb-2">デジタルデータのダウンロード</h2>
            <p className="text-sm text-neutral-700 mb-3">
              下のリンクからダウンロードできます。リンクは一定時間で無効になります。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/api/download?token=${encodeURIComponent(order.downloadToken)}`}
                className="inline-flex items-center rounded-xl bg-black text-white px-4 py-2 text-sm hover:opacity-90"
              >
                ダウンロードする
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border bg-amber-50 p-4">
            <h2 className="text-lg font-medium mb-2">決済を受け付けました（処理中）</h2>
            <p className="text-sm text-neutral-800">
              ただいまダウンロード用リンクを準備しています。通常は数分以内に
              <b>「【Momentia】デジタル画像のダウンロード方法」</b> という件名のメールが届きます。
            </p>
            <p className="text-xs text-neutral-600 mt-2">
              ※ 10分以上メールが届かない場合は、お手数ですが{" "}
              <a href="mailto:info@evoluzio.com" className="underline">
                info@evoluzio.com
              </a>{" "}
             までご連絡ください。
            </p>
          </div>
        )
      ) : null}

      <div className="grid gap-2 text-sm text-neutral-700 pt-4">
        <p>・デジタル商品：ダウンロードリンクはこの画面に表示されるか、メールでお送りします（リンクは一定期間で失効）。</p>
        <p>・パネル商品：ご入力いただいた住所に発送します。準備が整い次第、メールでご連絡します（送料込み、税込）。</p>
      </div>

      <div className="pt-2">
        <Link
          href="/gallery"
          className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm"
        >
          ギャラリーへ戻る
        </Link>
      </div>
    </section>
  );
}
