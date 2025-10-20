"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PhotoAlbum from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/plugins/captions.css";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import { logger, serializeError } from "@/lib/logger";
const log = logger.child({ module: "app/gallery" });

export const dynamic = "force-dynamic";

const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;

// ===== Types =====
type Item = {
  slug: string;
  width: number;
  height: number;
  caption?: string | null;
  keywords: string[];
  priceDigitalJPY?: number | null; // ← 追加
  pricePrintA2JPY?: number | null;
  sellDigital?: boolean;
  sellPanel?: boolean;
  photographer?: {
    id: string;
    slug: string;
    name: string;
    displayName?: string | null;
  } | null;
  urls: { thumb: string | null; large: string | null; watermarked?: string | null };
};

type Photographer = {
  id: string;
  slug: string;
  name: string;
  displayName?: string | null;
  profileUrl?: string | null;
};

// ===== Small helpers =====
function useViewportWidth() {
  const [w, setW] = useState<number>(typeof window === "undefined" ? 1200 : window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

function GalleryPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const openSlug = params.get("open");
  const initialPhotographer = (() => {
    const slug = params.get("photographer");
    return slug && SLUG_PATTERN.test(slug) ? slug : "all";
  })();
  const [items, setItems] = useState<Item[]>([]);
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [selectedPhotographer, setSelectedPhotographer] = useState<string>(initialPhotographer);
  const [index, setIndex] = useState<number | -1>(-1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const vw = useViewportWidth();
  const rowH = vw < 640 ? 150 : vw < 900 ? 170 : vw < 1280 ? 200 : 220;
  const preloaded = useRef<Set<string>>(new Set());

  useEffect(() => {
    const slug = params.get("photographer");
    const normalized = slug && SLUG_PATTERN.test(slug) ? slug : "all";
    setSelectedPhotographer((prev) => (prev === normalized ? prev : normalized));
  }, [params]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/photographers", { cache: "no-store" });
        const raw = await res.text();
        const json = raw ? JSON.parse(raw) : { items: [] };
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        setPhotographers(Array.isArray(json.items) ? (json.items as Photographer[]) : []);
      } catch (e) {
        log.error("Gallery photographers load failed", { err: serializeError(e) });
      }
    })();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setItems([]);
    preloaded.current.clear();

    (async () => {
      try {
        const qs = new URLSearchParams();
        if (selectedPhotographer !== "all") qs.set("photographer", selectedPhotographer);
        const query = qs.toString();
        const res = await fetch(`/api/photos${query ? `?${query}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const raw = await res.text();
        const json = raw ? JSON.parse(raw) : { items: [] };
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        setItems((json.items ?? []) as Item[]);
      } catch (e: any) {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(String(e?.message || e));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [selectedPhotographer]);

  useEffect(() => {
    setIndex(-1);
  }, [selectedPhotographer]);

  const visibleItems = useMemo(() => items.filter((i) => i.urls.thumb && i.urls.large), [items]);

  useEffect(() => {
    if (!openSlug || visibleItems.length === 0) return;
    const idx = visibleItems.findIndex((i) => i.slug === openSlug);
    setIndex(idx >= 0 ? idx : -1);
  }, [openSlug, visibleItems]);

  useEffect(() => {
    if (typeof document === "undefined" || visibleItems.length === 0) return;
    const head = document.head;
    if (!head) return;

    const cache = preloaded.current;

    const preloadTargets = visibleItems
      .slice(0, 6)
      .map((item) => item.urls.thumb ?? item.urls.large)
      .filter((src): src is string => typeof src === "string" && src.length > 0);

    const created: Array<{ src: string; el: HTMLLinkElement }> = [];
    for (const src of preloadTargets) {
      if (cache.has(src)) continue;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = src;
      head.appendChild(link);
      cache.add(src);
      created.push({ src, el: link });
    }

    return () => {
      for (const { src, el } of created) {
        if (el.parentNode === head) head.removeChild(el);
        cache.delete(src);
      }
    };
  }, [visibleItems]);

  const { filterOptions, shouldShowFilter } = useMemo(() => {
    const options = photographers.map((p) => ({
      slug: p.slug,
      label: p.displayName || p.name,
    }));
    const optionSlugs = new Set(options.map((o) => o.slug));
    const hasSelected = selectedPhotographer === "all" || optionSlugs.has(selectedPhotographer);
    const extra =
      !hasSelected && selectedPhotographer !== "all"
        ? [{ slug: selectedPhotographer, label: selectedPhotographer }]
        : [];
    const list = [{ slug: "all", label: "All Photographers" }, ...extra, ...options];
    const showFilter =
      optionSlugs.size > 1 && !(selectedPhotographer !== "all" && optionSlugs.has(selectedPhotographer));
    return { filterOptions: list, shouldShowFilter: showFilter };
  }, [photographers, selectedPhotographer]);

  const photos = visibleItems.map((i) => ({
    key: i.slug,
    src: i.urls.thumb as string,
    width: i.width,
    height: i.height,
    largeSrc: i.urls.large as string,
    caption: i.caption ?? "",
  }));

  const handlePhotographerSelect = (slug: string) => {
    const next = slug === "all" ? "all" : slug;
    if (next === selectedPhotographer) return;
    setSelectedPhotographer(next);
    const nextParams = new URLSearchParams(params.toString());
    nextParams.delete("open");
    if (next === "all") {
      nextParams.delete("photographer");
    } else {
      nextParams.set("photographer", next);
    }
    const query = nextParams.toString();
    router.push(`/gallery${query ? `?${query}` : ""}`, { scroll: false });
  };

  const active = index >= 0 ? visibleItems[index] : null;
  const priceDigital = (active?.priceDigitalJPY ?? 11000) as number;
  const pricePrintA2 = (active?.pricePrintA2JPY ?? 55000) as number;

  const canDigital = active ? (active.sellDigital ?? true) : true;
  const canPanel = active ? (active.sellPanel ?? true) : true;
  const hasAnyPurchase = canDigital || canPanel;
  const purchaseLabel = canDigital && canPanel
    ? `Purchase ¥${priceDigital.toLocaleString()}（税込） / A2 ¥${pricePrintA2.toLocaleString()}（送料込み、税込）`
    : canDigital
      ? `Purchase データ ¥${priceDigital.toLocaleString()}（税込）`
      : canPanel
        ? `Purchase A2 ¥${pricePrintA2.toLocaleString()}（送料込み、税込）`
        : '';

  const wmSrc = (slug: string) => `/api/wm/${encodeURIComponent(slug)}?w=2048`;

  return (
    <div className="bg-neutral-50">
      <section className="grid gap-10 px-4 sm:px-6 max-w-5xl md:max-w-6xl lg:max-w-7xl mx-auto py-6 sm:py-8">
        {/* Intro Card */}
        <div className="rounded-2xl bg-gradient-to-br from-neutral-50 to-neutral-100/70 shadow-sm ring-1 ring-black/5 p-6 md:p-8 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.03),transparent_40%),radial-gradient(circle_at_80%_0,rgba(0,0,0,0.04),transparent_35%)]" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-neutral-800">Gallery</h2>
              {/* <p className="text-sm text-neutral-600 mt-1">風景、花、マクロ。最新の作品をお楽しみください。</p> */}
            </div>
            <div className="flex gap-2">
              <Link
                href="/blog"
                className="inline-flex items-center rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium ring-1 ring-black/10 hover:bg-white"
              >
                Blog
              </Link>
              <Link
                href="/purchase/info"
                className="inline-flex items-center rounded-full bg-black text-white px-3 py-1.5 text-xs font-semibold hover:bg-neutral-800"
              >
                購入について
              </Link>
            </div>
          </div>
        </div>

        {/* Photographer filter */}
        {shouldShowFilter && (
          <div className="flex flex-wrap items-center gap-2">
            {filterOptions.map((option) => {
              const active = selectedPhotographer === option.slug;
              return (
                <button
                  key={option.slug}
                  type="button"
                  onClick={() => handlePhotographerSelect(option.slug)}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "bg-black text-white shadow-sm"
                      : "bg-white text-neutral-700 ring-1 ring-black/10 hover:bg-neutral-100"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-neutral-200" />
            ))}
          </div>
        )}

        {!isLoading && !error && visibleItems.length === 0 && (
          <div className="text-sm text-neutral-600">該当する作品がありません。</div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {visibleItems.length > 0 && (
          <PhotoAlbum
            layout="rows"
            photos={photos.map((p) => ({ src: p.src, width: p.width, height: p.height, key: p.key }))}
            targetRowHeight={rowH}
            rowConstraints={{ minPhotos: 1, maxPhotos: 4 }}
            onClick={({ index }) => setIndex(index)}
            componentsProps={{
              image: {
                className:
                  "m-2 sm:m-3 rounded-2xl shadow-md ring-1 ring-black/5 bg-white/95 transition-transform duration-300 hover:scale-[1.01] hover:shadow-xl overflow-hidden",
                loading: "lazy",
                decoding: "async",
              },
            }}
          />
        )}

        <Lightbox
          open={index >= 0}
          close={() => setIndex(-1)}
          index={index >= 0 ? index : 0}
          slides={visibleItems.map((i) => ({
            // Always go through the WM API so it can return existing WM or generate on demand
            src: wmSrc(i.slug),
            description: [
              i.caption ? String(i.caption) : null,
              i.photographer
                ? `Photographer: ${i.photographer.displayName || i.photographer.name}`
                : null,
            ]
              .filter(Boolean)
              .join(" / "),
          }))}
          animation={{ fade: 250 }}
          controller={{ closeOnPullDown: true, closeOnBackdropClick: false }}
          on={{ view: ({ index }) => setIndex(index) }}
          toolbar={{
            buttons: [
              <div key="purchase-info" className="yarl__button flex items-center gap-4">
                {active && hasAnyPurchase && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          router.push(`/purchase/${active.slug}`);
                        } catch (e) {
                          log.error("Gallery navigation to purchase failed", {
                            slug: active?.slug,
                            err: serializeError(e),
                          });
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-white text-black px-4 py-1.5 text-sm font-semibold shadow-md hover:shadow-lg active:scale-[0.99] transition-all"
                      aria-label="Purchase this photo"
                    >
                      <>
                        <span className="hidden md:inline">{purchaseLabel}</span>
                        <span className="md:hidden">Purchase</span>
                      </>
                    </button>
                  </>
                )}
              </div>,
              "close",
            ],
          }}
          plugins={[Thumbnails, Captions]}
          thumbnails={{
            position: "bottom",
            width: 96,
            height: 64,
            gap: 8,
          }}
          captions={{
            descriptionTextAlign: "start",
            descriptionMaxLines: 3,
          }}
        />
      </section>
    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-600">Loading gallery...</div>}>
      <GalleryPageInner />
    </Suspense>
  );
}

// NOTE: The purchase CTA is always enabled and no environment variable is required.
