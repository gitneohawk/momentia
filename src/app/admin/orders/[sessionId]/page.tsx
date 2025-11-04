import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Shipping = {
  name?: string | null;
  phone?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
} | null;

export default async function OrderDetailPage({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const p = await params;
  const order = await prisma.order.findUnique({
    where: { sessionId: p.sessionId },
  });

  if (!order) {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-xl font-semibold mb-4">注文が見つかりません</h1>
        <Link href="/admin/orders" className="text-blue-600 underline">一覧へ戻る</Link>
      </section>
    );
  }

  const shipping = order.shipping as Shipping;

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">注文詳細</h1>
        <Link href="/admin/orders" className="text-sm underline underline-offset-2">一覧へ戻る</Link>
      </div>

      <div className="grid gap-1 text-sm">
        <div><span className="text-neutral-500">Session:</span> <span className="font-mono">{order.sessionId}</span></div>
        <div><span className="text-neutral-500">日時:</span> {new Date(order.createdAt).toLocaleString()}</div>
        <div><span className="text-neutral-500">Email:</span> {order.email ?? "-"}</div>
        <div><span className="text-neutral-500">種類:</span> {order.itemType}</div>
        <div><span className="text-neutral-500">Slug:</span> {order.slug ?? "-"}</div>
        <div>
          <span className="text-neutral-500">金額:</span>{" "}
          {order.amountJpy.toLocaleString()} 円
          <span className="ml-1 text-xs text-neutral-500">
            {order.itemType === "panel" ? "（送料込み、税込）" : "（税込）"}
          </span>
        </div>
        <div><span className="text-neutral-500">通貨:</span> {order.currency}</div>
        <div><span className="text-neutral-500">ステータス:</span> {order.status}</div>
      </div>

      <div className="grid gap-2">
        <h2 className="text-lg font-medium">配送先</h2>
        {shipping ? (
          <div className="rounded-xl border p-4 text-sm">
            <div>{shipping?.name ?? "-"}</div>
            <div>{shipping?.address?.line1 ?? ""} {shipping?.address?.line2 ?? ""}</div>
            <div>{shipping?.address?.city ?? ""} {shipping?.address?.state ?? ""}</div>
            <div>{shipping?.address?.postal_code ?? ""} {shipping?.address?.country ?? ""}</div>
            {shipping?.phone ? <div>電話: {shipping.phone}</div> : null}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">（配送情報なし / デジタル商品の可能性）</p>
        )}
      </div>

      <div className="grid gap-2">
        <h2 className="text-lg font-medium">Metadata</h2>
        <pre className="rounded-xl border p-4 text-xs bg-neutral-50 overflow-x-auto">
{JSON.stringify(order.metadata ?? {}, null, 2)}
        </pre>
      </div>
    </section>
  );
}
