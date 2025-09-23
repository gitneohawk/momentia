// src/app/purchase/success/page.tsx
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic"; // 完全に動的レンダリング
export const revalidate = 0; // 再検証しない（キャッシュ無効）

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
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams;
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
      },
    })) as OrderSummary | null;
  }

  // 日時整形（JST）
  const formatDate = (d: Date | undefined) =>
    d ? new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "-";

  const formatJPY = (v: number | null | undefined) =>
    v == null ? "-" : new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(v);

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

            <div className="text-neutral-500">金額</div>
            <div>{formatJPY(order.amountJpy)}（税込）</div>

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

      <div className="grid gap-2 text-sm text-neutral-700 pt-4">
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