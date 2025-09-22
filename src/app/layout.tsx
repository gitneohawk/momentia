import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Suspense } from "react";
import AdminMenu from "@/components/AdminMenu";
import { Inter, Lora } from 'next/font/google' // フォントをインポート

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
export const metadata: Metadata = {
  ...(_base ? { metadataBase: new URL(_base) } : {}),
  title: "Momentia",
  description: "Momentia — A photo portfolio & sales platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${inter.variable} ${lora.variable} antialiased`}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-neutral-50 text-neutral-900`}>
        <Providers>
        <header className="border-b border-neutral-200/80 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="text-xl font-semibold tracking-tight">Momentia</Link>
              <nav className="flex items-center gap-5 text-sm text-neutral-600 ml-0">
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
        <footer className="mt-16 border-t border-neutral-200/80">
          <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-neutral-500 flex items-center justify-between bg-white">
            <span>© {new Date().getFullYear()} Evoluzio Inc.</span>
            <div className="flex gap-4">
              <Link href="/legal/license" className="hover:text-neutral-900 transition">ライセンス</Link>
              <Link href="/legal/terms" className="hover:text-neutral-900 transition">利用規約</Link>
              <Link href="/legal/privacy" className="hover:text-neutral-900 transition">プライバシー</Link>
            </div>
            <a href="https://evoluzio.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:opacity-90 transition">
              <span>Powered by</span>
              <img src="/logos/Evoluzio_Logo.png" alt="Evoluzio Inc." className="h-5 w-auto" />
            </a>
          </div>
        </footer>
        </Providers>
      </body>
    </html>
  );
}
