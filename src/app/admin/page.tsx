// src/app/admin/page.tsx
import Link from "next/link";

type AdminShortcut = {
  title: string;
  description: string;
  href: string;
};

const shortcuts: AdminShortcut[] = [
  {
    title: "Orders",
    description: "決済済みの注文状況を確認し、ステータスを更新します。",
    href: "/admin/orders",
  },
  {
    title: "Photo Upload",
    description: "新しい作品をアップロードし、必要に応じて公開設定します。",
    href: "/admin/upload",
  },
  {
    title: "Photo Library",
    description: "既存の写真を編集・タグ付けし、販売設定を管理します。",
    href: "/admin/manage",
  },
  {
    title: "Photographers",
    description: "フォトグラファーのプロフィールや紐付けを管理します。",
    href: "/admin/photographers",
  },
  {
    title: "Blog",
    description: "記事の作成・編集・公開ステータスを管理します。",
    href: "/admin/blog",
  },
  {
    title: "Inquiries",
    description: "問い合わせ内容を確認し、必要に応じて対応状況を更新します。",
    href: "/admin/inquiries",
  },
];

export default function AdminDashboard() {
  return (
    <main className="bg-neutral-50 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 sm:px-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Admin Console
          </h1>
          <p className="text-sm text-neutral-600 sm:text-base">
            よく使う管理メニューに素早くアクセスできます。必要な作業を選択してください。
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex h-full flex-col justify-between rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
            >
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-neutral-900 group-hover:text-neutral-700">
                  {item.title}
                </h2>
                <p className="text-sm leading-relaxed text-neutral-600">{item.description}</p>
              </div>
              <span className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-500">
                開く →
              </span>
            </Link>
          ))}
        </section>

        <section className="rounded-2xl bg-white p-5 text-sm text-neutral-600 shadow-sm ring-1 ring-black/5">
          <h2 className="text-base font-semibold text-neutral-900">運用メモ</h2>
          <p className="mt-2 leading-relaxed">
            作品の公開・非公開や購入フローに関わる変更を行った場合は、念のためギャラリーと購入ページの表示を確認してください。
          </p>
        </section>
      </div>
    </main>
  );
}
