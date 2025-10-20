const infoSections = [
  {
    title: "販売事業者",
    body: <p className="text-sm text-neutral-700">株式会社エヴォルツィオ</p>,
  },
  {
    title: "運営責任者",
    body: <p className="text-sm text-neutral-700">代表取締役　高橋伸和</p>,
  },
  {
    title: "所在地",
    body: (
      <p className="text-sm text-neutral-700">
        〒150-0013<br />
        東京都渋谷区恵比寿4-20-3<br />
        恵比寿ガーデンプレイスタワー 18階
      </p>
    ),
  },
  {
    title: "お問い合わせ先",
    body: (
      <p className="text-sm text-neutral-700">
        メール: <a href="mailto:info@evoluzio.com" className="underline">info@evoluzio.com</a><br />
        （お問い合わせはメールにて承ります。）
      </p>
    ),
  },
];

const policySections = [
  {
    title: "販売価格",
    body: <p className="text-sm text-neutral-700">各商品ページに税込価格を表示しています。</p>,
  },
  {
    title: "商品代金以外の必要料金",
    body: (
      <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
        <li>インターネット接続に伴う通信費用（通信事業者が定める料金）</li>
        <li>プリント商品の送料は商品価格に含みます。</li>
      </ul>
    ),
  },
  {
    title: "お支払方法",
    body: <p className="text-sm text-neutral-700">クレジットカード決済（Stripe）</p>,
  },
  {
    title: "お支払時期",
    body: <p className="text-sm text-neutral-700">ご注文時点で即時決済されます。</p>,
  },
  {
    title: "商品の引渡し時期",
    body: (
      <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
        <li>デジタル商品: 決済完了後、即時にダウンロードリンクを発行します。</li>
        <li>プリント商品: ご注文後に製作し、約14日以内に発送します。</li>
      </ul>
    ),
  },
  {
    title: "返品・交換・キャンセル",
    body: (
      <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
        <li>デジタル商品: 性質上、返品・キャンセルは受け付けておりません。</li>
        <li>プリント商品: 不良品または配送中の破損があった場合に限り、速やかに再送いたします。</li>
        <li>再送をご希望の場合は、商品到着後7日以内に上記お問い合わせ先までご連絡ください。</li>
      </ul>
    ),
  },
  {
    title: "動作環境",
    body: <p className="text-sm text-neutral-700">特別な動作環境は必要ありません。一般的なウェブブラウザで閲覧・ダウンロードが可能です。</p>,
  },
  {
    title: "その他",
    body: <p className="text-sm text-neutral-700">価格・内容は予告なく変更する場合があります。最新情報は各商品ページをご確認ください。</p>,
  },
];

export default function TokushoPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">特定商取引法に基づく表記</h1>
        <p className="text-sm text-neutral-600">
          電気通信事業法および特定商取引法に則り、以下のとおり必要事項を表示します。
        </p>
      </header>

      <section className="space-y-12">
        <div className="grid gap-4 md:grid-cols-2">
          {infoSections.map((section) => (
            <article key={section.title} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-900">{section.title}</h2>
              <div className="mt-3 text-sm text-neutral-700 leading-relaxed">{section.body}</div>
            </article>
          ))}
        </div>

        <div className="space-y-6">
          {policySections.map((section) => (
            <article key={section.title} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-900">{section.title}</h2>
              <div className="mt-3 text-sm text-neutral-700 leading-relaxed">{section.body}</div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mt-10 text-xs text-neutral-500">制定日: 2025年10月20日</footer>
    </main>
  );
}
