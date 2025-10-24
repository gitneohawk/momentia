"use client";

import { useRef, useState } from "react";

type Props = {
  targetInputId?: string;
  slugInputId?: string;
};

const DEFAULT_TARGET_ID = "profileUrl";

export default function PhotographerImageUploader({
  targetInputId = DEFAULT_TARGET_ID,
  slugInputId = "slug",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobKey, setBlobKey] = useState<string | null>(null);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    setBlobKey(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選択してください");
      setSelectedFile(null);
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
  };

  const resolveTargetInput = () => {
    const el = document.getElementById(targetInputId) as HTMLInputElement | null;
    return el;
  };

  const resolveSlugValue = () => {
    if (!slugInputId) return null;
    const el = document.getElementById(slugInputId) as HTMLInputElement | null;
    return el?.value?.trim() || null;
  };

  const insertIntoTarget = (value: string) => {
    const input = resolveTargetInput();
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const onUpload = async () => {
    if (!selectedFile) return;
    setBusy(true);
    setError(null);
    setBlobKey(null);

    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const slug = resolveSlugValue();
      if (slug) form.append("slug", slug);

      const res = await fetch("/api/admin/photographers/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }

      const json = await res.json();
      let key: string | null = null;

      const candidateFields = [
        "path",
        "blobPath",
        "key",
        "blobKey",
        "name",
        "filename",
        "savedAs",
      ] as const;

      for (const field of candidateFields) {
        const value = (json as Record<string, unknown>)[field];
        if (typeof value === "string" && value.length > 0) {
          key = value;
          break;
        }
      }

      if (!key) {
        const urlLike =
          (json as Record<string, unknown>).url ??
          (json as Record<string, unknown>).blobUrl ??
          (json as Record<string, unknown>).sasUrl;
        if (typeof urlLike === "string" && urlLike.length > 0) {
          try {
            const u = new URL(urlLike, window.location.origin);
            const idx = u.pathname.indexOf("/photos/");
            if (idx >= 0) {
              key = u.pathname.substring(idx + "/photos/".length);
            } else if (!u.protocol.startsWith("http")) {
              key = urlLike;
            }
          } catch {
            key = String(urlLike);
          }
        }
      }

      if (!key) {
        const preview = JSON.stringify(json).slice(0, 200);
        throw new Error(`Upload succeeded but no key was returned. Response: ${preview}`);
      }

      setBlobKey(key);
      insertIntoTarget(key);
      if (fileRef.current) fileRef.current.value = "";
      setSelectedFile(null);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="rounded border border-neutral-200 p-3 space-y-2">
      <div className="font-semibold text-sm">プロフィール画像アップロード</div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} />
        {selectedFile && (
          <span className="text-xs text-neutral-500">
            選択中: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
          </span>
        )}
        <button
          type="button"
          className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          onClick={onUpload}
          disabled={busy || !selectedFile}
        >
          {busy ? "アップロード中..." : "アップロード"}
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {!error && blobKey && (
        <div className="space-y-2 text-sm">
          <div className="text-green-700">アップロード完了。入力欄を上書きしました。</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-500">Blob key:</span>
            <code className="bg-neutral-100 px-1 py-0.5">{blobKey}</code>
            <button
              type="button"
              className="rounded border border-neutral-300 px-2 py-1"
              onClick={() => copyText(blobKey)}
            >
              コピー
            </button>
            <button
              type="button"
              className="rounded border border-neutral-300 px-2 py-1"
              onClick={() => insertIntoTarget(blobKey)}
            >
              入力欄に挿入
            </button>
          </div>
          <div className="text-xs text-neutral-500">
            表示URL: <code>/api/photographers/image/{blobKey}</code>
          </div>
        </div>
      )}
    </div>
  );
}
