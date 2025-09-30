"use client";

import { useState } from "react";

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());

    const res = await fetch("/api/inquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.errors ? "入力内容を確認してください。" : "送信に失敗しました。");
      return;
    }
    setDone(true);
    e.currentTarget.reset();
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <h1 className="text-2xl font-semibold mb-4">お問い合わせを送信しました</h1>
        <p className="text-neutral-600">
          確認のうえ折り返しご連絡いたします。しばらくお待ちください。
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1 className="text-2xl font-semibold mb-6">お問い合わせ</h1>
      {err && <p className="mb-4 text-red-600">{err}</p>}
      <form onSubmit={onSubmit} className="space-y-5">
        {/* honeypot */}
        <input type="text" name="hpt" className="hidden" tabIndex={-1} autoComplete="off" />

        <div>
          <label className="block text-sm text-neutral-700 mb-1">お名前 *</label>
          <input name="name" required className="w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-neutral-700 mb-1">メールアドレス *</label>
          <input type="email" name="email" required className="w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-neutral-700 mb-1">件名</label>
          <input name="subject" className="w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-neutral-700 mb-1">お問い合わせ内容 *</label>
          <textarea name="message" required rows={6} className="w-full rounded-md border px-3 py-2" />
        </div>
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-neutral-900 text-white px-4 py-2 disabled:opacity-60"
          >
            {loading ? "送信中…" : "送信する"}
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          送信いただいた情報はプライバシーポリシーに従って取り扱います。
        </p>
      </form>
    </div>
  );
}