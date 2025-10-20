"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { logger, serializeError } from "@/lib/logger";
const log = logger.child({ module: "app/admin/blog/list" });

type Item = {
  id: string; slug: string; title: string;
  description: string | null;
  published: boolean; publishedAt: string | null; createdAt: string;
};

export default function AdminBlogList() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  (async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/blog", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setItems(json.items ?? []);
    } catch (e) {
      log.error("Admin blog list fetch failed", { err: serializeError(e) });
      setItems([]);
    } finally {
      setLoading(false);
    }
  })();
}, []);

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Blog 記事一覧</h1>
        <Link href="/admin/blog/new" className="px-3 py-2 rounded bg-black text-white">新規記事</Link>
      </div>

      {loading ? <p>読み込み中…</p> : (
        <ul className="divide-y divide-neutral-200 bg-white rounded border">
          {items.map(p => (
            <li key={p.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">
                  <Link href={`/admin/blog/${p.slug}`} className="hover:underline">{p.title}</Link>
                  {!p.published && <span className="ml-2 text-xs rounded bg-neutral-200 px-2 py-0.5">下書き</span>}
                </div>
                <div className="text-sm text-neutral-600">{p.description}</div>
                <div className="text-xs text-neutral-500 mt-1">
                  {p.published ? `公開: ${p.publishedAt ? new Date(p.publishedAt).toLocaleString() : "-"}` : `作成: ${new Date(p.createdAt).toLocaleString()}`}
                </div>
              </div>
              <Link href={`/admin/blog/${p.slug}`} className="text-sm px-3 py-1.5 rounded border hover:bg-neutral-50">編集</Link>
            </li>
          ))}
          {items.length === 0 && <li className="p-6 text-neutral-500">まだ記事がありません</li>}
        </ul>
      )}
    </section>
  );
}
