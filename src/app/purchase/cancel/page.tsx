// src/app/purchase/cancel/page.tsx
import Link from "next/link";

export default function PurchaseCancelPage(props: any) {
  const slug = props?.searchParams?.slug as string | undefined;
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold mb-4">決済が完了しませんでした</h1>
      <p className="text-neutral-700">
        カード認証エラーや操作中断などにより、決済は実行されていません。
        もう一度お試しになるか、不明点があればお問い合わせください。
      </p>

      <div className="mt-8 flex gap-3">
        {slug ? (
          <Link
            href={`/purchase/${slug}`}
            className="inline-block rounded-md bg-black text-white px-4 py-2"
          >
            もう一度購入手続きへ
          </Link>
        ) : (
          <Link
            href="/gallery"
            className="inline-block rounded-md bg-black text-white px-4 py-2"
          >
            ギャラリーへ戻る
          </Link>
        )}
        <Link
          href="/contact"
          className="inline-block rounded-md border px-4 py-2"
        >
          お問い合わせ
        </Link>
      </div>
    </div>
  );
}