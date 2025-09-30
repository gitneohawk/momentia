"use client";

import { useEffect, useMemo, useState } from "react";

type Inquiry = {
  id: string;
  name: string;
  email: string;
  subject?: string | null;
  message: string;
  status: "NEW" | "OPEN" | "CLOSED";
  createdAt: string;
};

export default function AdminInquiriesPage() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/admin/inquiries", { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const j = await res.json();
        if (alive) setItems(j.items ?? []);
      } catch (e) {
        if (alive) setErr("読み込みに失敗しました");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const newCount = useMemo(() => items.filter((i) => i.status === "NEW").length, [items]);

  async function updateStatus(id: string, status: Inquiry["status"]) {
    setSavingId(id);
    try {
      const res = await fetch("/api/admin/inquiries", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("failed");
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
    } catch (e) {
      alert("更新に失敗しました");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">お問い合わせ一覧</h1>
          <p className="text-neutral-600 text-sm mt-1">最新200件 / 未読 {newCount} 件</p>
        </div>
        <button
          onClick={() => location.reload()}
          className="rounded bg-neutral-900 text-white px-3 py-2 text-sm"
        >
          再読み込み
        </button>
      </div>

      {loading && <div className="text-neutral-500">読み込み中…</div>}
      {err && <div className="text-red-600 mb-4">{err}</div>}

      {!loading && !err && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-3 py-2">日時</th>
                <th className="px-3 py-2">名前</th>
                <th className="px-3 py-2">メール</th>
                <th className="px-3 py-2">件名</th>
                <th className="px-3 py-2">本文</th>
                <th className="px-3 py-2">ステータス</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(it.createdAt).toLocaleString("ja-JP", { hour12: false })}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <a href={`mailto:${it.email}`} className="text-blue-700 hover:underline">{it.email}</a>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.subject ?? "-"}</td>
                  <td className="px-3 py-2 max-w-[28rem]">
                    <div className="line-clamp-3 text-neutral-700 break-words">{it.message}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={
                      `px-2 py-0.5 rounded text-xs ` +
                      (it.status === "NEW"
                        ? "bg-amber-100 text-amber-800"
                        : it.status === "OPEN"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-green-100 text-green-800")
                    }>{it.status}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue={it.status}
                        onChange={(e) => updateStatus(it.id, e.currentTarget.value as Inquiry["status"])}
                        disabled={savingId === it.id}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="NEW">NEW</option>
                        <option value="OPEN">OPEN</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {items.length === 0 && (
            <div className="text-neutral-500 py-10 text-center">問い合わせはまだありません</div>
          )}
        </div>
      )}
    </div>
  );
}
