"use client";
import { useState } from "react";
import { blogMdxTemplate } from "@/lib/mdxTemplates";
import BlogImageUploader from "@/components/BlogImageUploader";

const mdxHasImage = (s: string) => /!\[[^\]]*\]\(([^)]+)\)/.test(s || "");

export default function AdminBlogNew() {
  const [form, setForm] = useState({
    slug: "",
    title: "",
    description: "",
    heroPath: "",
    tags: "",
    bodyMdx: blogMdxTemplate(),
    published: false,
    date: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const hasHero = (form.heroPath ?? "").trim().length > 0;
  const hasMdxImage = mdxHasImage(form.bodyMdx);
  const canSave = hasHero || hasMdxImage;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      setMsg("画像が必要です（Hero Path か MDX内の画像のいずれかを入れてください）");
      setBusy(false);
      return;
    }
    setBusy(true); setMsg(null);
    const payload = {
      ...form,
      tags: form.tags.split(",").map(s => s.trim()).filter(Boolean),
    };
    const res = await fetch("/api/admin/blog", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "",
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) setMsg("保存しました");
    else setMsg("エラー");
    setBusy(false);
  };

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold mb-4">新規記事</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Slug</label>
          <input className="mt-1 w-full border rounded px-3 py-2" value={form.slug} onChange={e=>setForm(f=>({...f, slug:e.target.value}))} required />
        </div>
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
          <input className="mt-1 w-full border rounded px-3 py-2" value={form.heroPath} onChange={e=>setForm(f=>({...f, heroPath:e.target.value}))} placeholder="/og/xxx.jpg or https://..." />
          <p className={`mt-1 text-xs ${hasHero ? "text-green-600" : "text-neutral-500"}`}>
            例: <code>/api/blog/image/hero/xxxx.jpg</code> または <code>https://…</code> {hasHero ? "✓ 入力あり" : "（未入力）"}
          </p>
          <div className="mt-2">
            <BlogImageUploader heroInputId="heroPath" />
            <p className="mt-1 text-xs text-neutral-500">
              画像を選択してアップロード→「Hero Path に挿入」を押すと、上の入力欄に自動で反映されます。
            </p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Tags (comma separated)</label>
          <input className="mt-1 w-full border rounded px-3 py-2" value={form.tags} onChange={e=>setForm(f=>({...f, tags:e.target.value}))} />
        </div>
        <div>
          <label className="block text-sm font-medium">Body (MDX)</label>
          <textarea className="mt-1 w-full border rounded px-3 py-2 h-64 font-mono" value={form.bodyMdx} onChange={e=>setForm(f=>({...f, bodyMdx:e.target.value}))} required />
          <p className={`mt-1 text-xs ${hasMdxImage ? "text-green-600" : "text-neutral-500"}`}>
            MDX内の画像 {hasMdxImage ? "✓ 検出されました" : "（まだ見つかりません）"}
          </p>
        </div>
        {!canSave && (
          <div className="text-sm text-red-600">
            公開・保存には画像が1枚以上必要です。<br />Hero Path を入力するか、本文(MDX)に <code>![alt](path)</code> 形式で画像を追加してください。
          </div>
        )}
        <div className="flex items-center gap-3">
          <button disabled={!canSave || busy} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">{busy ? "保存中…" : "保存"}</button>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, bodyMdx: blogMdxTemplate() }))}
            className="px-3 py-2 rounded border border-neutral-300 hover:bg-neutral-50"
          >
            テンプレ挿入
          </button>
          {msg && <span className="text-sm text-neutral-600">{msg}</span>}
        </div>
      </form>
    </section>
  );
}