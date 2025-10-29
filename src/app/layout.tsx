import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Suspense } from "react";
import AdminMenu from "@/components/AdminMenu";
import { Inter, Lora } from 'next/font/google' // フォントをインポート
import AnalyticsConsent from "@/components/AnalyticsConsent";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";

// フォントの設定
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter', // CSS変数として定義
})
const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-lora', // CSS変数として定義
})
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const _base = process.env.NEXT_PUBLIC_BASE_URL;
const siteTitle = "Momentia - 光と時間の呼吸を、そっと壁に。";
const siteDescription =
  "Momentiaは、光と時間をテーマにした写真レーベル。静けさを連れてくる作品をお届けします。";
const ogImage = "/ogp.jpg";
export const metadata: Metadata = {
  ...(_base ? { metadataBase: new URL(_base) } : {}),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: "Momentia",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "Momentia — 光と時間をテーマにした写真レーベル",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [ogImage],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? null;
  return (
    <html lang="ja" className={`${inter.variable} ${lora.variable} antialiased`}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-neutral-50 text-neutral-900`}>
        <Providers>
        <header className="border-b border-neutral-200/80 bg-white">
          <div className="mx-auto max-w-6xl px-2 py-4 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center">
                <img
                  src="/momentia_logo.svg"
                  alt="Momentia"
                  className="block h-7 md:h-9 w-auto translate-y-[-7px]"
                />
              </Link>
              <nav className="flex items-center gap-5 text-sm text-neutral-600 ml-2 md:ml-3">
                <Link href="/gallery" className="hover:text-neutral-900 transition">Gallery</Link>
                <Link href="/blog" className="hover:text-neutral-900 transition">Blog</Link>
              </nav>
            </div>
            <div className="flex items-center">
              <Suspense>
                <AdminMenu />
              </Suspense>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="text-center text-sm text-neutral-500 space-y-2">
          <div className="space-x-4">
            <Link href="/legal/license" className="hover:underline">ライセンス</Link>
            <Link href="/legal/terms" className="hover:underline">利用規約</Link>
            <Link href="/legal/privacy" className="hover:underline">プライバシー</Link>
            <Link href="/legal/tokusho" className="hover:underline">特定商取引法に基づく表記</Link>
            <Link href="/contact" className="hover:underline">お問い合わせ</Link>
          </div>
          <p>
            © 2025 <a href="https://www.evoluzio.com" target="_blank" rel="noopener noreferrer" className="hover:underline">
              Evoluzio Inc.
            </a>
          </p>
        </footer>
        <AnalyticsConsent measurementId={gaMeasurementId} />
        <AnalyticsTracker measurementId={gaMeasurementId} />
        </Providers>
      </body>
    </html>
  );
}
