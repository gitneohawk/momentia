import { PrismaClient } from "@prisma/client";
import Link from "next/link";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic"; // 過剰キャッシュ回避

export default async function OrdersPage() {
  const items = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-semibold mb-4">注文一覧</h1>
      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-3 py-2 text-left">日時</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">種類</th>
              <th className="px-3 py-2 text-left">Slug</th>
              <th className="px-3 py-2 text-right">金額(JPY)</th>
              <th className="px-3 py-2 text-left">ステータス</th>
              <th className="px-3 py-2 text-left">Session</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((o: any) => (
  <tr key={o.sessionId} className="border-t hover:bg-neutral-50">
    <td className="px-3 py-2">
      <Link href={`/admin/orders/${o.sessionId}`} className="underline-offset-2 hover:underline">
        {new Date(o.createdAt).toLocaleString()}
      </Link>
    </td>
    <td className="px-3 py-2">{o.email ?? "-"}</td>
    <td className="px-3 py-2">{o.itemType}</td>
    <td className="px-3 py-2">{o.slug ?? "-"}</td>
    <td className="px-3 py-2 text-right">
      {o.amountJpy?.toLocaleString?.() ?? o.amountJpy}
      <span className="ml-1 text-xs text-neutral-500">
        {o.itemType === "panel" ? "（送料込み、税込）" : "（税込）"}
      </span>
    </td>
    <td className="px-3 py-2">{o.status}</td>
    <td className="px-3 py-2 font-mono">{o.sessionId.slice(0, 12)}…</td>
  </tr>
))}
          </tbody>
        </table>
      </div>
    </section>
  );
}