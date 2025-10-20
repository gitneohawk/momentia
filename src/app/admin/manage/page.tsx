"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { logger, serializeError } from "@/lib/logger";
const log = logger.child({ module: "app/admin/manage" });

type Item = {
  slug: string;
  width: number;
  height: number;
  caption?: string | null;
  keywords: string[];
  published: boolean;
  priceDigitalJPY: number | null; // ← 追加
  pricePrintA2JPY?: number | null;
  sellDigital: boolean;
  sellPanel: boolean;
  photographerId: string | null;
  photographer:
    | {
        id: string;
        slug: string;
        name: string;
        displayName?: string | null;
      }
    | null;
  urls: { thumb: string | null; large: string | null; original: string };
};

type Photographer = {
  id: string;
  slug: string;
  name: string;
  displayName?: string | null;
  contactEmail?: string | null;
};

function TagEditor({
  value,
  suggestions,
  onChange,
  disabled,
}: {
  value: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");

  const add = (raw: string) => {
    const t = norm(raw);
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setInput("");
  };
  const remove = (t: string) => onChange(value.filter((v) => v !== t));

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      add(input);
    }
  };

  const listId = "tag-suggest-list";
  const uniqSugs = Array.from(new Set(suggestions)).filter((s) => !value.includes(s));

  return (
    <div className="flex flex-wrap gap-2">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 border px-2 py-0.5 text-xs">
          {t}
          <button
            type="button"
            onClick={() => remove(t)}
            disabled={disabled}
            className="text-neutral-500 hover:text-neutral-800"
            aria-label={`${t} を削除`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder="タグを追加… (Enter)"
        className="min-w-[10rem] flex-1 border rounded px-2 py-1 text-sm"
      />
      <datalist id={listId}>
        {uniqSugs.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

export default function AdminManagePage() {
  const { status } = useSession();

  const [items, setItems] = useState<Item[]>([]);
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const allTagSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) for (const k of it.keywords || []) set.add(k);
    return Array.from(set).sort();
  }, [items]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterPhotographerId, setFilterPhotographerId] = useState<string>("");

  const loadPhotographers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/photographers", { cache: "no-store" });
      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setPhotographers(Array.isArray(json?.items) ? (json.items as Photographer[]) : []);
    } catch (err) {
      log.error("Admin manage load photographers failed", { err: serializeError(err) });
    }
  }, []);

  const refresh = useCallback(async () => {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/photos", { cache: "no-store" });
      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const arr = (json?.items ?? []).map((x: any) => ({
        ...x,
        keywords: Array.isArray(x?.keywords) ? x.keywords : [],
        sellDigital: typeof x?.sellDigital === "boolean" ? x.sellDigital : true,
        sellPanel: typeof x?.sellPanel === "boolean" ? x.sellPanel : true,
        photographerId: typeof x?.photographerId === "string" ? x.photographerId : null,
        photographer: x?.photographer
          ? {
              id: x.photographer.id,
              slug: x.photographer.slug,
              name: x.photographer.name,
              displayName: x.photographer.displayName ?? null,
            }
          : null,
      }));
      setItems(arr as Item[]);
      await loadPhotographers();
    } catch (err: any) {
      setItems([]);
      setMsg(err?.message || String(err));
    }
  }, [loadPhotographers]);

  useEffect(() => {
    if (status === "authenticated") {
      void refresh();
    }
  }, [status, refresh]);

  const saveCaption = async (slug: string, caption: string) => {
    setBusy(slug);
    const res = await fetch(`/api/admin/photo/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption }),
    });
    setBusy(null);
    setMsg(res.ok ? "Saved" : "Save failed");
    if (res.ok) refresh();
  };

  const togglePublished = async (slug: string, value: boolean) => {
    setBusy(slug);
    const res = await fetch(`/api/admin/photo/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: value }),
    });
    setBusy(null);
    if (!res.ok) {
      setMsg("Update failed");
      return;
    }
    setMsg(value ? "Published" : "Unpublished");
    setItems((prev) => prev.map((p) => (p.slug === slug ? { ...p, published: value } : p)));
  };

  const toggleSell = async (slug: string, field: "sellDigital" | "sellPanel", value: boolean) => {
    setBusy(slug);
    const res = await fetch(`/api/admin/photo/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setBusy(null);
    if (!res.ok) {
      setMsg("Update failed");
      return;
    }
    setMsg(`${field === "sellDigital" ? "Digital" : "Panel"} ${value ? "enabled" : "disabled"}`);
    setItems((prev) =>
      prev.map((p) => (p.slug === slug ? ({ ...p, [field]: value } as Item) : p))
    );
  };

  const savePrice = async (slug: string, price: number) => {
    setBusy(slug);
    const res = await fetch(`/api/admin/photo/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceDigitalJPY: price }),
    });
    setBusy(null);
    setMsg(res.ok ? "Price saved" : "Price save failed");
    if (res.ok) {
      setItems((prev) => prev.map((p) => (p.slug === slug ? { ...p, priceDigitalJPY: price } : p)));
    }
  };

  const savePriceA2 = async (slug: string, price: number) => {
    setBusy(slug);
    const res = await fetch(`/api/admin/photo/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePrintA2JPY: price }),
    });
    setBusy(null);
    setMsg(res.ok ? "Price (A2) saved" : "Price (A2) save failed");
    if (res.ok) {
      setItems((prev) => prev.map((p) => (p.slug === slug ? { ...p, pricePrintA2JPY: price } : p)));
    }
  };

  const saveTags = async (slug: string, tags: string[]) => {
    setBusy(slug);
    const res = await fetch(`/api/admin/photo/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: tags }),
    });
    setBusy(null);
    if (!res.ok) {
      setMsg("Tag update failed");
      return;
    }
    setMsg("Tags saved");
    setItems((prev) => prev.map((p) => (p.slug === slug ? { ...p, keywords: tags } : p)));
  };

  const assignPhotographer = async (slug: string, photographerId: string | null) => {
    setBusy(slug);
    try {
      const res = await fetch(`/api/admin/photo/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photographerId }),
      });
      const raw = await res.text();
      const json = raw ? JSON.parse(raw) : null;
      setBusy(null);
      if (!res.ok) {
        setMsg(json?.error || "Photographer update failed");
        return;
      }
      const updated = json?.photo;
      setItems((prev) =>
        prev.map((p) =>
          p.slug === slug
            ? {
                ...p,
                photographerId: updated?.photographerId ?? photographerId ?? null,
                photographer: updated?.photographer
                  ? {
                      id: updated.photographer.id,
                      slug: updated.photographer.slug,
                      name: updated.photographer.name,
                      displayName: updated.photographer.displayName ?? null,
                    }
                  : null,
              }
            : p
        )
      );
      setMsg("Photographer saved");
    } catch (err: any) {
      setBusy(null);
      setMsg(err?.message || String(err));
    }
  };

  const remove = async (slug: string) => {
    if (!confirm(`Delete ${slug}? This removes blobs & DB rows.`)) return;
    setBusy(slug);
    const res = await fetch(`/api/admin/photo/${slug}`, { method: "DELETE" });
    setBusy(null);
    setMsg(res.ok ? "Deleted" : "Delete failed");
    if (res.ok) setItems((prev) => prev.filter((i) => i.slug !== slug));
  };

  // Session gates
  if (status === "loading") {
    return <section className="grid place-items-center min-h-[50vh] text-neutral-500">Loading session…</section>;
  }

  if (status === "unauthenticated") {
    return (
      <section className="grid gap-4 place-items-center min-h-[50vh]">
        <h1 className="text-xl font-semibold">Sign in required</h1>
        <button onClick={() => signIn("azure-ad")} className="border px-4 py-2 rounded text-sm">
          Sign in with Microsoft
        </button>
      </section>
    );
  }

  const filteredItems = filterPhotographerId
    ? items.filter((it) => (it.photographerId || "") === filterPhotographerId)
    : items;

  return (
    <section className="grid gap-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin: Manage</h1>
          <p className="text-sm text-neutral-600">編集・削除（Entra ID 保護中）</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterPhotographerId}
            onChange={(e) => setFilterPhotographerId(e.currentTarget.value)}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="">すべての写真家</option>
            {photographers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName || p.name}
              </option>
            ))}
          </select>
          <button onClick={refresh} className="border px-3 py-1.5 rounded text-sm">Reload</button>
        </div>
      </header>

      {msg && <div className="text-sm text-neutral-500">{msg}</div>}

      <ul className="grid gap-4">
        {filteredItems.map((it) => (
          <li key={it.slug} className="flex gap-4 border rounded p-3">
            <img
              src={it.urls.thumb ?? it.urls.large ?? it.urls.original}
              alt={it.slug}
              className="w-40 h-28 object-cover rounded border"
            />
            <div className="flex-1 grid gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-500">
                  {it.slug} — {it.width}×{it.height}
                </div>

                {/* 公開トグル */}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={it.published}
                    onChange={(e) => togglePublished(it.slug, e.currentTarget.checked)}
                    disabled={busy === it.slug}
                  />
                  <span>{it.published ? "Published" : "Unpublished"}</span>
                </label>
              </div>

              {/* 販売可否トグル */}
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={it.sellDigital}
                    onChange={(e) => toggleSell(it.slug, "sellDigital", e.currentTarget.checked)}
                    disabled={busy === it.slug}
                  />
                  <span>Digital 販売</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={it.sellPanel}
                    onChange={(e) => toggleSell(it.slug, "sellPanel", e.currentTarget.checked)}
                    disabled={busy === it.slug}
                  />
                  <span>パネル販売</span>
                </label>
              </div>

              <textarea
                defaultValue={it.caption ?? ""}
                rows={2}
                className="w-full border rounded p-2 text-sm"
                onBlur={(e) => {
                  const v = e.currentTarget.value;
                  if (v !== (it.caption ?? "")) saveCaption(it.slug, v);
                }}
              />

              {/* Photographer selection */}
              <div className="grid gap-1">
                <label className="text-sm text-neutral-600">Photographer</label>
                <select
                  value={it.photographerId ?? ""}
                  onChange={(e) =>
                    assignPhotographer(it.slug, e.currentTarget.value ? e.currentTarget.value : null)
                  }
                  disabled={busy === it.slug}
                  className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                >
                  <option value="">未設定</option>
                  {photographers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName || p.name} ({p.slug})
                    </option>
                  ))}
                </select>
                {it.photographer && (
                  <p className="text-xs text-neutral-500">
                    現在: {it.photographer.displayName || it.photographer.name}（slug: {it.photographer.slug}）
                  </p>
                )}
              </div>

              {/* タグ（カテゴリ） */}
              <div className="grid gap-1">
                <label className="text-sm text-neutral-600">Tags</label>
                <TagEditor
                  value={it.keywords || []}
                  suggestions={allTagSuggestions}
                  disabled={busy === it.slug}
                  onChange={(next) => saveTags(it.slug, next)}
                />
              </div>

              {/* 価格（JPY） */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600">Price (Digital, JPY)</label>
                <input
                  type="number"
                  min={0}
                  defaultValue={it.priceDigitalJPY ?? 3000}
                  className="w-32 border rounded px-2 py-1 text-sm"
                  onBlur={(e) => {
                    const v = Math.max(0, Math.floor(Number(e.currentTarget.value) || 0));
                    if (v !== (it.priceDigitalJPY ?? 0)) savePrice(it.slug, v);
                  }}
                />
              </div>

              {/* 価格（A2, JPY） */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600">Price (Print A2, JPY)</label>
                <input
                  type="number"
                  min={0}
                  defaultValue={it.pricePrintA2JPY ?? 50000}
                  className="w-32 border rounded px-2 py-1 text-sm"
                  onBlur={(e) => {
                    const v = Math.max(0, Math.floor(Number(e.currentTarget.value) || 0));
                    if (v !== (it.pricePrintA2JPY ?? 0)) savePriceA2(it.slug, v);
                  }}
                />
              </div>

              <div className="flex gap-2">
                <a href={it.urls.large ?? it.urls.original} target="_blank" className="border px-2 py-1 rounded text-sm">
                  Open
                </a>
                <button
                  onClick={() => remove(it.slug)}
                  disabled={busy === it.slug}
                  className="border px-2 py-1 rounded text-sm text-red-600 disabled:opacity-50"
                >
                  {busy === it.slug ? "Working..." : "Delete"}
                </button>
              </div>
            </div>
          </li>
        ))}
        {filteredItems.length === 0 && (
          <li className="border rounded p-4 text-sm text-neutral-500">
            該当する写真がありません。
          </li>
        )}
      </ul>

      {msg && <div className="text-sm text-neutral-500">{msg}</div>}
    </section>
  );
}
