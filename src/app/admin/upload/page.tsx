"use client";

import { useCallback, useState } from "react";

export default function AdminUploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [wm, setWm] = useState(true); // アップロード後にWM生成（推奨）

  const onChangeFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles(Array.from(e.target.files));
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []).filter(f => /\.(jpe?g|png|webp|tiff?)$/i.test(f.name));
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  }, []);

  const onUpload = useCallback(async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("wm", wm ? "1" : "0");
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = await res.json();
        setLogs(prev => [
          `[${res.ok ? "ok" : "err"}] ${file.name} → ${json?.slug ?? json?.error ?? "-"}`,
          ...prev,
        ]);
      }
      setFiles([]);
    } catch (e:any) {
      setLogs(prev => [String(e?.message || e), ...prev]);
    } finally {
      setBusy(false);
    }
  }, [files, wm]);

  return (
    <section className="grid gap-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin: Upload</h1>
        <p className="text-sm text-neutral-600">JPG/PNG/WebP/TIFF をドラッグ＆ドロップ、またはファイル選択でアップロードします。</p>
      </header>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-lg border border-dashed border-neutral-300 p-10 grid place-items-center text-neutral-500"
      >
        ドロップして追加
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input type="file" multiple accept="image/*" onChange={onChangeFiles} />
        <label className="inline-flex items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            checked={wm}
            onChange={(e) => setWm(e.target.checked)}
            className="accent-black"
            disabled={busy}
          />
          アップロード後にWM生成（推奨）
        </label>
        <button
          onClick={onUpload}
          disabled={busy || !files.length}
          className="rounded-md border border-neutral-900 px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Uploading..." : `Upload ${files.length ? `(${files.length})` : ""}`}
        </button>
      </div>

      {!!files.length && (
        <ul className="text-sm text-neutral-600 list-disc pl-5">
          {files.map((f) => (
            <li key={f.name}>{f.name} — {(f.size/1024/1024).toFixed(2)} MB</li>
          ))}
        </ul>
      )}

      {!!logs.length && (
        <div className="rounded-md bg-neutral-50 border border-neutral-200 p-4">
          <div className="font-medium mb-2">Logs</div>
          <ul className="text-xs text-neutral-600 space-y-1">
            {logs.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}