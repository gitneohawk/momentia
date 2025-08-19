"use client";

import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string; // e.g. "/blog"
  className?: string;
}

export default function Pagination({ currentPage, totalPages, basePath, className = "" }: PaginationProps) {
  const page = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const total = Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1;

  if (total <= 1) return null;

  const toHref = (p: number) => (p <= 1 ? basePath : `${basePath}?page=${p}`);

  const hasPrev = page > 1;
  const hasNext = page < total;

  return (
    <nav className={`flex items-center justify-center gap-6 mt-8 ${className}`} aria-label="Pagination">
      {/* Prev */}
      {hasPrev ? (
        <Link href={toHref(page - 1)} rel="prev" className="rounded border px-4 py-2 text-sm hover:bg-neutral-50">
          ← Previous
        </Link>
      ) : (
        <span className="px-4 py-2 text-sm text-transparent">← Previous</span>
      )}

      {/* Indicator */}
      <span className="text-sm text-neutral-700 select-none">
        Page <strong>{page}</strong> of <strong>{total}</strong>
      </span>

      {/* Next */}
      {hasNext ? (
        <Link href={toHref(page + 1)} rel="next" className="rounded border px-4 py-2 text-sm hover:bg-neutral-50">
          Next →
        </Link>
      ) : (
        <span className="px-4 py-2 text-sm text-transparent">Next →</span>
      )}
    </nav>
  );
}
