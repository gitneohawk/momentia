"use client";

import { useCallback, useRef, useState } from "react";

export default function AdminUploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [genWM, setGenWM] = useState(true); // アップロード後にWM生成するか
  const abortRef = useRef<AbortController | null>(null);
  const ts = () => new Date().toLocaleTimeString("ja-JP", { hour12: false });

  const onChangeFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files).filter(f => /\.(jpe?g|png|webp|tiff?)$/i.test(f.name));
    setFiles(prev => [...prev, ...selected]);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []).filter(f => /\.(jpe?g|png|webp|tiff?)$/i.test(f.name));
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  }, []);

  const onUpload = useCallback(async () => {
    if (!files.length) return;
    setBusy(true);
    setDone(0);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    try {
      let processed = 0;
      for (const file of files) {
        if (signal.aborted) break;
        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/admin/upload", { method: "POST", body: form, signal });
          const text = await res.text();
          let json: any = {};
          try { json = text ? JSON.parse(text) : {}; } catch { json = { error: "invalid json", _raw: text }; }
          const ok = res.ok;
          const slug = json?.slug as string | undefined;
          setLogs(prev => [
            `[${ts()}] [${ok ? "ok" : "err"}] ${file.name} → ${slug ?? json?.error ?? "-"}`,
            ...prev,
          ]);
          // 成功時：WMを事前生成
          if (ok && genWM && slug) {
            try {
              const wmRes = await fetch(`/api/wm/${encodeURIComponent(slug)}?generate=1&debug=1`, { cache: "no-store", redirect: "manual" as any, signal });
              setLogs(prev => [
                `[${ts()}] [wm] ${slug} ${wmRes.ok ? "generated" : `failed (${wmRes.status})`}`,
                ...prev,
              ]);
            } catch (e:any) {
              setLogs(prev => [`[${ts()}] [wm] ${slug} generate error: ${String(e?.message || e)}`, ...prev]);
            }
          }
        } catch (e:any) {
          if (e?.name === "AbortError") {
            setLogs(prev => [`[${ts()}] upload aborted`, ...prev]);
            break;
          }
          setLogs(prev => [`[${ts()}] [err] ${file.name}: ${String(e?.message || e)}`, ...prev]);
        } finally {
          processed += 1;
          setDone(processed);
        }
      }
      setFiles([]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [files, genWM]);

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
      <p className="text-xs text-neutral-500 -mt-6">対応: JPG/PNG/WebP/TIFF（拡張子で判定）。大量追加時は数回に分けてのアップロードを推奨。</p>

      <div className="flex flex-wrap items-center gap-3">
        <input type="file" multiple accept="image/*" onChange={onChangeFiles} />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={genWM} onChange={(e) => setGenWM(e.target.checked)} />
          アップロード後にWM生成（推奨）
        </label>
        <button
          onClick={onUpload}
          disabled={busy || !files.length}
          className="rounded-md border border-neutral-900 px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? `Uploading... ${done}/${files.length}` : `Upload ${files.length ? `(${files.length})` : ""}`}
        </button>
        <button
          onClick={() => { abortRef.current?.abort(); }}
          disabled={!busy}
          className="rounded-md border border-neutral-300 px-3 py-2 text-xs text-neutral-600 disabled:opacity-50"
          title="現在のアップロードを中止"
        >
          Cancel
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