"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PhotoAlbum from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";


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

// Blur-up image component for nicer loading（未使用だが再利用用に残す）
function BlurImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      {...props}
      onLoad={(e) => {
        setLoaded(true);
        props.onLoad?.(e);
      }}
      className={[
        "h-full w-full object-cover transition-transform duration-300",
        loaded ? "blur-0" : "blur-[8px]",
        props.className ?? "",
      ].join(" ")}
      loading={props.loading ?? "lazy"}
      decoding={props.decoding ?? "async"}
    />
  );
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
    <section className="grid gap-10 px-4 sm:px-6 max-w-5xl md:max-w-6xl lg:max-w-7xl mx-auto">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-800">Gallery</h1>
        <p className="text-sm text-neutral-500">最新アップロードから最大100件を表示します。</p>
      </header>

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
      />
    </section>
  );
}