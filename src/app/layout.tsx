import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Momentia",
  description: "Momentia — A photo portfolio & sales platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-neutral-50 text-neutral-900`}>
        <Providers>
        <header className="border-b border-neutral-200/80">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-semibold tracking-tight">Momentia</Link>
            <nav className="flex items-center gap-5 text-sm text-neutral-600">
              <Link href="/gallery" className="hover:text-neutral-900 transition">Gallery</Link>
              <Link href="/admin/upload" className="hover:text-neutral-900 transition">Admin Upload</Link>
              <Link href="/admin/manage" className="hover:text-neutral-900 transition">Manage</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="mt-16 border-t border-neutral-200/80">
          <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-neutral-500">
            © {new Date().getFullYear()} Evoluzio Inc.
          </div>
        </footer>
        </Providers>
      </body>
    </html>
  );
}
