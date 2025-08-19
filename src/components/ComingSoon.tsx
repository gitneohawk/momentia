"use client";
import { useEffect } from "react";
import Link from "next/link";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
};

export default function ComingSoon({ open, onClose, title, message }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* card */}
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
        <h3 className="text-lg font-semibold tracking-tight">
          {title ?? "購入準備中"}
        </h3>
        <p className="mt-2 text-sm text-neutral-600">
          {message ?? "現在オンライン購入フローを整備中です。"}
        </p>

        <div className="mt-4 space-y-2 text-sm">
          <div className="rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-200">
            <p className="font-medium">予定ラインアップ（仮）</p>
            <ul className="mt-1 list-disc pl-5">
              <li>額装 A2（木製枠 / UVカットアクリル）: 税込 <strong>¥50,000〜</strong></li>
              <li>配送: 国内のみ（納期目安: 2〜3週間）</li>
            </ul>
          </div>
          <p className="text-neutral-500">
            ご相談は <a className="underline" href="mailto:info@evoluzio.com">info@evoluzio.com</a> まで。
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-50"
          >
            閉じる
          </button>
          <Link href="/purchase/info/">詳しく見る</Link>
        </div>
      </div>
    </div>
  );
}