// src/app/admin/page.tsx
import Link from "next/link";

export default function AdminDashboard() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <section className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded p-4 bg-gray-50">
            <div className="text-gray-600 text-sm mb-1">新着問い合わせ</div>
            <div className="text-2xl font-semibold">3件</div>
          </div>
          <div className="border rounded p-4 bg-gray-50">
            <div className="text-gray-600 text-sm mb-1">直近の売上</div>
            <div className="text-2xl font-semibold">¥12,000</div>
          </div>
          <div className="border rounded p-4 bg-gray-50">
            <div className="text-gray-600 text-sm mb-1">アクセス数</div>
            <div className="text-2xl font-semibold">256</div>
          </div>
        </div>
      </section>
      <ul className="space-y-4">
        <li>
          <Link href="/admin/orders" className="text-blue-600 underline">
            Orders 管理
          </Link>
        </li>
        <li>
          <Link href="/admin/upload" className="text-blue-600 underline">
            Photos アップロード
          </Link>
        </li>
        <li>
          <Link href="/admin/manage" className="text-blue-600 underline">
            Photos 管理
          </Link>
        </li>
        <li>
          <Link href="/admin/blog" className="text-blue-600 underline">
            Blog 管理
          </Link>
        </li>
        <li>
          <Link href="/admin/inquiries" className="text-blue-600 underline">
            Inquiries 管理
          </Link>
        </li>
      </ul>
    </main>
  );
}