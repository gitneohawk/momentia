import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Admin / Photographers" };

export default async function AdminPhotographersPage() {
  const photographers = await prisma.photographer.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      displayName: true,
      createdAt: true,
    },
  });

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Photographers</h1>
        <Link
          href="/admin/photographers/new"
          className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          新規作成
        </Link>
      </header>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white shadow-sm">
        <table className="min-w-full text-sm text-neutral-800">
          <thead className="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Display Name</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Edit</th>
            </tr>
          </thead>
          <tbody>
            {photographers.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100">
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-neutral-600">{p.slug}</td>
                <td className="px-3 py-2">{p.displayName ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-500">
                  {new Date(p.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/photographers/${p.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500"
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}
            {photographers.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-neutral-500" colSpan={5}>
                  まだ登録がありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
