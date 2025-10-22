


const sections = [
  {
    title: "取得する情報",
    items: [
      "購入時に入力いただく氏名、メールアドレスなどの情報",
      "決済に関する情報（カード番号等は決済事業者が保持し、当サービスでは保持しません）",
      "アクセスログ、Cookie、ブラウザ情報等",
    ],
  },
  {
    title: "利用目的",
    items: [
      "商品の提供、決済、納品のため",
      "お問い合わせ対応やサポート提供のため",
      "サービス改善および新機能開発のため",
      "不正利用防止・セキュリティ確保のため",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Momentia プライバシーポリシー</h1>
        <p className="text-sm text-neutral-600">
          Momentia（以下「当サービス」）は、利用者の個人情報を適切に取り扱うことを重要な責務と認識し、以下のとおりプライバシーポリシーを定めます。
        </p>
      </header>

      <section className="space-y-12">
        {sections.map((section) => (
          <article key={section.title} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-neutral-900">{section.title}</h2>
            <ul className="mt-4 space-y-2 text-sm text-neutral-700">
              {section.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-neutral-500" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}

        <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-neutral-900">第三者提供</h2>
          <p className="mt-3 text-sm text-neutral-700">
            当サービスは、法令に基づく場合を除き、利用者の同意なく個人情報を第三者に提供することはありません。ただし、決済処理など業務委託先に必要な範囲で提供することがあります。
          </p>
        </article>

        <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-neutral-900">Cookie・解析ツール</h2>
          <div className="mt-3 space-y-3 text-sm text-neutral-700">
            <p>
              当サービスでは、利用状況の把握とサービス改善のために Google Analytics 4 を利用し、Cookie を通じて匿名化されたトラフィックデータを収集します。取得したデータは統計的な分析のみに使用し、個人を特定する情報と紐づけることはありません。
            </p>
            <p>
              Cookie の利用に同意した場合のみ解析タグが有効になります。ページ下部の同意バナーで「同意しない」を選択、またはブラウザ設定で Cookie を無効化することで収集を停止できます。加えて、
              <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="underline">
                Google が提供するオプトアウトアドオン
              </a>
              を利用することでも計測を無効化できます。
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-neutral-900">安全管理</h2>
          <p className="mt-3 text-sm text-neutral-700">
            当サービスは、個人情報を適切に管理し、漏洩・改ざん・不正アクセスなどの防止に努めます。
          </p>
        </article>

        <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-neutral-900">開示・訂正・削除</h2>
          <p className="mt-3 text-sm text-neutral-700">
            利用者が自身の個人情報の開示・訂正・削除を希望される場合には、合理的な範囲で速やかに対応します。<br />
            ご請求は <a href="mailto:info@evoluzio.com" className="underline">info@evoluzio.com</a> までお知らせください。
          </p>
        </article>

        <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-neutral-900">改定</h2>
          <p className="mt-3 text-sm text-neutral-700">
            本プライバシーポリシーは必要に応じて改定される場合があります。改定後は本ページに掲載した時点から効力を生じます。
          </p>
        </article>
      </section>

      <footer className="mt-10 text-xs text-neutral-500">制定日: 2025年9月2日 / 最終更新日: 2025年10月22日</footer>
    </main>
  );
}
