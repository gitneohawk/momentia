"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Props = {
  measurementId?: string | null;
};

export function AnalyticsTracker({ measurementId }: Props) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";

  useEffect(() => {
    if (!measurementId) return;
    if (typeof window === "undefined") return;
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag !== "function") return;

    const path = `${pathname}${search ? `?${search}` : ""}`;
    gtag("config", measurementId, {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [measurementId, pathname, search]);

  return null;
}
