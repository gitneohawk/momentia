"use client";

import { useState, useRef } from "react";

type Props = {
  heroInputId?: string; // 例: "heroPath"
};

export default function BlogImageUploader({ heroInputId = "heroPath" }: Props) {
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    setKey(null);
    if (!f) {
      setSelectedFile(null);
      return;
    }
    if (!f.type.startsWith("image/")) {
      setError("画像ファイルを選択してください");
      setSelectedFile(null);
      e.target.value = "";
      return;
    }
    setSelectedFile(f);
  };

  const onUpload = async () => {
    const file = selectedFile;
    if (!file) return;

    setBusy(true);
    setError(null);
    setKey(null);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/admin/blog/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Upload failed (${res.status})`);
      }
      const json = await res.json();

      // Try to resolve the blob "key" from various possible response shapes.
      // Accepted fields (string, non-empty): key, blobKey, path, blobPath, name, filename, savedAs, blob
      let k: string | null = null;

      const candidateFields = [
        "key",
        "blobKey",
        "path",
        "blobPath",
        "name",
        "filename",
        "savedAs",
        "blob",
      ] as const;

      for (const f of candidateFields) {
        const v = (json as Record<string, unknown>)[f];
        if (typeof v === "string" && v.length > 0) {
          k = v;
          break;
        }
      }

      // URL-based responses
      if (!k) {
        const urlLike = (json as Record<string, unknown>).url
          ?? (json as Record<string, unknown>).blobUrl
          ?? (json as Record<string, unknown>).sasUrl;

        if (typeof urlLike === "string" && urlLike.length > 0) {
          try {
            const u = new URL(urlLike, window.location.origin);

            // If backend returns our proxy URL (/api/blog/image/<key>)
            if (u.pathname.startsWith("/api/blog/image/")) {
              k = u.pathname.replace("/api/blog/image/", "");
            } else {
              // If backend returns direct blob URL like https://.../blog/<key>
              const i = u.pathname.indexOf("/blog/");
              if (i >= 0) {
                k = u.pathname.substring(i + "/blog/".length);
              } else {
                // As a last resort, keep the URL as-is (component will still work)
                k = urlLike;
              }
            }
          } catch {
            // Non-URL string: keep as key
            k = String(urlLike);
          }
        }
      }

      // { container: "blog", blob: "<key>" } pattern
      if (!k) {
        const container = (json as Record<string, unknown>).container;
        const blob = (json as Record<string, unknown>).blob;
        if (container === "blog" && typeof blob === "string" && blob.length > 0) {
          k = blob;
        }
      }

      if (!k) {
        // Include a short preview of the server response to aid debugging
        const preview = JSON.stringify(json).slice(0, 300);
        throw new Error(`Upload succeeded, but no key/url was returned. Server response: ${preview}`);
      }
      setKey(k);
      // reset file input for re-upload
      if (fileRef.current) fileRef.current.value = "";
      setSelectedFile(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const insertHero = () => {
    if (!key) return;
    const el = document.getElementById(heroInputId) as HTMLInputElement | null;
    if (el) {
      el.value = key;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const mdxTag = key ? `![](/api/blog/image/${key})` : "";

  return (
    <div className="rounded border p-3 space-y-2">
      <div className="font-semibold">画像アップロード</div>
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} />
        {selectedFile && (
          <span className="text-xs text-neutral-600">選択中: {selectedFile.name}</span>
        )}
        <button
          type="button"
          className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
          onClick={onUpload}
          disabled={busy || !selectedFile}
        >
          {busy ? "アップロード中..." : "アップロード"}
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {!error && key && (
        <div className="text-green-700 text-sm">アップロード完了。下のボタンで反映・コピーできます。</div>
      )}

      {key && (
        <div className="space-y-2">
          <div className="text-sm">
            <span className="text-neutral-500">Blob key:</span>{" "}
            <code className="bg-neutral-100 px-1">{key}</code>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-2 py-1 border rounded"
              onClick={() => copy(key)}
            >
              キーをコピー
            </button>
            <button
              type="button"
              className="px-2 py-1 border rounded"
              onClick={insertHero}
            >
              Hero Path に挿入
            </button>
            <button
              type="button"
              className="px-2 py-1 border rounded"
              onClick={() => copy(mdxTag)}
            >
              MDX 画像タグをコピー
            </button>
          </div>
          <div className="text-xs text-neutral-500">
            表示URL: <code>/api/blog/image/{key}</code>
          </div>
        </div>
      )}
    </div>
  );
}