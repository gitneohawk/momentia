"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { blogMdxTemplate } from "@/lib/mdxTemplates";
import Link from "next/link";
import dynamic from "next/dynamic";
import { logger, serializeError } from "@/lib/logger";
const BlogImageUploader = dynamic(() => import("@/components/BlogImageUploader"), { ssr: false });
const log = logger.child({ module: "app/admin/blog/edit" });

type Form = {
  slug: string; title: string; description: string;
  heroPath: string; tags: string; bodyMdx: string;
  published: boolean; date: string;
};

export default function AdminBlogEdit() {
  const params = useParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const router = useRouter();
  const slugDep = slug ?? "";

  const [form, setForm] = useState<Form>({
    slug: "", title: "", description: "", heroPath: "",
    tags: "", bodyMdx: blogMdxTemplate(), published: false, date: "",
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (!slugDep) { setLoading(false); return; }
      try {
        const res = await fetch(`/api/admin/blog/${slugDep}`, { cache: "no-store" });
        if (!res.ok) { setMsg("記事を取得できませんでした"); return; }
        const p = await res.json();
        setForm({
          slug: p.slug,
          title: p.title ?? "",
          description: p.description ?? "",
          heroPath: p.heroPath ?? "",
          tags: (p.tags ?? []).join(", "),
          bodyMdx: p.bodyMdx ?? "",
          published: !!p.published,
          date: p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0,16) : "",
        });
      } catch (e) {
        log.error("Admin blog load failed", { err: serializeError(e) });
        setMsg("通信エラーが発生しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [slugDep]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const payload = {
      title: form.title,
      description: form.description || null,
      heroPath: form.heroPath || null,
      tags: (form.tags || "").split(",").map((s) => s.trim()).filter(Boolean),
      bodyMdx: form.bodyMdx,
      published: form.published,
      date: form.date ? new Date(form.date).toISOString() : null,
    };
    const res = await fetch(`/api/admin/blog/${slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("保存しました");
    } else {
      let detail = "";
      try { const j = await res.json(); detail = j?.error ? `: ${j.error}` : ""; } catch {}
      setMsg(`エラー${detail}`);
    }
    if (res.ok) router.refresh();
  };

  const del = async () => {
    if (!confirm("この記事を削除します。よろしいですか？")) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/blog/${slug}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/admin/blog");
    } else {
      let detail = "";
      try { const j = await res.json(); detail = j?.error ? `: ${j.error}` : ""; } catch {}
      setMsg(`削除に失敗しました${detail}`);
    }
  };

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {!slug && <p className="text-sm text-neutral-500 mb-4">パラメータ待機中…</p>}
      <h1 className="text-xl font-semibold mb-4">記事編集: {slug}</h1>
      {loading && <p className="text-sm text-neutral-500 mb-4">読み込み中…</p>}
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy || loading}>
          <div>
            <label className="block text-sm font-medium">Title</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={form.title} onChange={e=>setForm(f=>({...f, title:e.target.value}))} required />
          </div>
          <div>
            <label className="block text-sm font-medium">Description</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={form.description} onChange={e=>setForm(f=>({...f, description:e.target.value}))} />
          </div>
          <div>
            <label className="block text-sm font-medium">Hero Path</label>
            <input
              id="heroPath"
              className="mt-1 w-full border rounded px-3 py-2"
              value={form.heroPath}
              onChange={e => setForm(f => ({ ...f, heroPath: e.target.value }))}
              placeholder="hero/xxx.jpg (Blob key)"
            />
            <div className="mt-2">
              <BlogImageUploader heroInputId="heroPath" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Tags (comma separated)</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={form.tags} onChange={e=>setForm(f=>({...f, tags:e.target.value}))} />
          </div>
          <div>
            <label className="block text-sm font-medium">Body (MDX)</label>
            <textarea className="mt-1 w-full border rounded px-3 py-2 h-64 font-mono" value={form.bodyMdx} onChange={e=>setForm(f=>({...f, bodyMdx:e.target.value}))} required />
          </div>
          <div className="flex items-center gap-2">
            <input id="pub" type="checkbox" checked={form.published} onChange={e=>setForm(f=>({...f, published:e.target.checked}))} />
            <label htmlFor="pub">公開する</label>
            <input
              type="datetime-local"
              className="ml-4 border rounded px-2 py-1 text-sm"
              value={form.date}
              onChange={e=>setForm(f=>({...f, date:e.target.value}))}
              disabled={!form.published}
            />
          </div>
          <div className="flex items-center gap-3">
            <button disabled={busy} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">{busy ? "保存中…" : "保存"}</button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, bodyMdx: blogMdxTemplate() }))}
              className="px-3 py-2 rounded border border-neutral-300 hover:bg-neutral-50"
            >
              テンプレ挿入
            </button>
            <Link
              href={`/admin/blog/preview/${slug}`}
              target="_blank"
              rel="noreferrer"
              prefetch={false}
              className="px-3 py-2 rounded border border-neutral-300 hover:bg-neutral-50"
            >
              プレビュー
            </Link>
            <Link
              href={`/blog/${slug}`}
              target="_blank"
              rel="noreferrer"
              prefetch={false}
              className="px-3 py-2 rounded border border-neutral-300 hover:bg-neutral-50"
            >
              公開ページ
            </Link>
            <button
              type="button"
              onClick={del}
              className="px-3 py-2 rounded border border-red-300 text-red-700 hover:bg-red-50"
            >
              削除
            </button>
            {msg && <span className="text-sm text-neutral-600">{msg}</span>}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
