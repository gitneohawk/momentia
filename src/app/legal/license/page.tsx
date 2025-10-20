

const sections = [
  {
    title: "許可される利用",
    items: [
      "個人または法人が自らの業務・活動のために利用すること",
      "ウェブサイト、広告、印刷物、プレゼン資料、SNS投稿などへの掲載",
      "社内資料や社内プレゼンテーションでの利用",
    ],
  },
  {
    title: "禁止される利用",
    items: [
      "本画像の再配布、再販売、第三者への譲渡",
      "本画像を用いた商品化（再販を目的としたグッズやテンプレート等）",
      "公序良俗に反する用途や違法行為への利用",
    ],
  },
  {
    title: "ライセンスの性質",
    items: [
      "非独占的・譲渡不可の利用権を付与します",
      "本画像を改変・加工して利用することはできますが、禁止事項に抵触する場合は不可とします",
    ],
  },
];

export default function LicensePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Momentia 画像利用ライセンス</h1>
        <p className="text-sm text-neutral-600">
          本サービスから購入・ダウンロードされた画像（以下「本画像」）は、以下の条件に基づきご利用いただけます。購入・ダウンロードした時点で、本ライセンスへ同意したものとみなします。
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
          <h2 className="text-xl font-semibold text-neutral-900">契約成立</h2>
          <p className="mt-3 text-sm text-neutral-700">
            本画像を購入またはダウンロードした時点で、本ライセンスに同意したものとみなします。
          </p>
        </article>
      </section>

      <footer className="mt-10 text-xs text-neutral-500">制定日: 2025年9月2日</footer>
    </main>
  );
}
