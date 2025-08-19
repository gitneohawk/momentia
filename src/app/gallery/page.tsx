"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PhotoAlbum from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/plugins/captions.css";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";


// ===== Types =====
type Item = {
  slug: string;
  width: number;
  height: number;
  caption?: string | null;
  keywords: string[];
  priceDigitalJPY?: number | null; // ← 追加
  urls: { thumb: string | null; large: string | null; original?: string };
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

export default function GalleryPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState<number | -1>(-1);
  const [error, setError] = useState<string | null>(null);
  const vw = useViewportWidth();
  const rowH = vw < 640 ? 150 : vw < 900 ? 170 : vw < 1280 ? 200 : 220;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/photos", { cache: "no-store" });
        const raw = await res.text();
        const json = raw ? JSON.parse(raw) : { items: [] };
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        setItems((json.items ?? []) as Item[]);
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  const visibleItems = useMemo(() => items.filter((i) => i.urls.thumb && i.urls.large), [items]);

  const photos = useMemo(() => {
    return visibleItems.map((i) => ({
      key: i.slug,
      src: i.urls.thumb as string,
      width: i.width,
      height: i.height,
      largeSrc: i.urls.large as string,
      caption: i.caption ?? "",
    }));
  }, [visibleItems]);

  const active = index >= 0 ? visibleItems[index] : null;

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

        {/* Loading skeleton */}
        {items.length === 0 && !error && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-neutral-200" />
            ))}
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {visibleItems.length > 0 && (
          <PhotoAlbum
            layout="rows"
            photos={photos.map((p) => ({ src: p.src, width: p.width, height: p.height, key: p.key }))}
            targetRowHeight={rowH}
            rowConstraints={{ minPhotos: 2, maxPhotos: 3 }}
            onClick={({ index }) => setIndex(index)}
            componentsProps={{
              image: { className: "m-2 sm:m-3 rounded-2xl shadow-md ring-1 ring-black/5 bg-white/95 transition-transform duration-300 hover:scale-[1.01] hover:shadow-xl overflow-hidden" },
            }}
          />
        )}

        <Lightbox
          open={index >= 0}
          close={() => setIndex(-1)}
          index={index >= 0 ? index : 0}
          slides={visibleItems.map((i) => ({
            src: `/api/wm/${i.slug}`,
            description: i.caption ?? "",
          }))}
          animation={{ fade: 250 }}
          controller={{ closeOnPullDown: true, closeOnBackdropClick: false }}
          on={{ view: ({ index }) => setIndex(index) }}
          toolbar={{
            buttons: [
              <div key="purchase-info" className="yarl__button flex items-center gap-4">
                {active && (
                  <>
                    <div className="text-left text-[12px] text-white hidden sm:block">
                      {active.caption && <div className="font-medium line-clamp-1">{active.caption}</div>}
                      <div className="text-white/85">
                        {active.width}×{active.height} px・DL ¥
                        {((active.priceDigitalJPY ?? 3000) as number).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/purchase/${active.slug}`);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-white text-black px-4 py-1.5 text-sm font-semibold shadow-md hover:shadow-lg active:scale-[0.99] transition-all"
                    >
                      Purchase
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