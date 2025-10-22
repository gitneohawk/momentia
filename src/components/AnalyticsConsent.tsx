"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";

type Props = {
  measurementId?: string | null;
};

type ConsentState = "loading" | "prompt" | "granted" | "rejected";

const STORAGE_KEY = "momentia_ga_consent";

export default function AnalyticsConsent({ measurementId }: Props) {
  const [state, setState] = useState<ConsentState>("loading");

  useEffect(() => {
    if (!measurementId) return setState("rejected");
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "granted" || stored === "rejected") {
        setState(stored);
      } else {
        setState("prompt");
      }
    } catch {
      setState("prompt");
    }
  }, [measurementId]);

  const handleAccept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "granted");
    } catch {}
    setState("granted");
  };

  const handleReject = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "rejected");
    } catch {}
    setState("rejected");
  };

  if (!measurementId) {
    return null;
  }

  const shouldRenderScripts = state === "granted";
  const shouldRenderBanner = state === "prompt";

  return (
    <>
      {shouldRenderScripts && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('consent', 'default', {
                'ad_storage': 'denied',
                'analytics_storage': 'granted'
              });
              gtag('config', '${measurementId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}

      {shouldRenderBanner && (
        <div className="fixed inset-x-0 bottom-0 z-[999] flex justify-center px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="max-w-3xl rounded-2xl bg-neutral-900/95 px-5 py-4 text-neutral-100 shadow-2xl backdrop-blur">
            <p className="text-sm leading-relaxed">
              Momentiaでは、サイト改善のために Google Analytics を使用します。計測のためには
              Cookie を利用するため、同意をお願いいたします。詳細は{" "}
              <Link href="/legal/privacy" className="underline hover:text-white">
                プライバシーポリシー
              </Link>{" "}
              をご確認ください。
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleAccept}
                className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200"
              >
                同意する
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="inline-flex items-center justify-center rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-800"
              >
                同意しない
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
