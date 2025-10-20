


type Clause = {
  title: string;
  body: React.ReactNode;
};

const clauses: Clause[] = [
  {
    title: "第1条（適用）",
    body: <p>本規約は、利用者と当サービスとの間の一切の利用関係に適用されます。</p>,
  },
  {
    title: "第2条（利用登録）",
    body: <p>本サービスの利用希望者は、当サービスの定める方法により利用登録を行い、当サービスが承認した場合に利用登録が完了するものとします。</p>,
  },
  {
    title: "第3条（利用料金および支払方法）",
    body: <p>利用者は、本サービス利用の対価として、当サービスが別途定め、表示する利用料金を、当サービスが指定する方法により支払うものとします。</p>,
  },
  {
    title: "第4条（禁止事項）",
    body: (
      <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
        <li>法令または公序良俗に違反する行為</li>
        <li>犯罪行為に関連する行為</li>
        <li>本サービスの運営を妨害する行為</li>
        <li>他の利用者または第三者の権利を侵害する行為</li>
        <li>不正アクセスやそれを試みる行為</li>
      </ul>
    ),
  },
  {
    title: "第5条（本サービスの提供の停止等）",
    body: <p>当サービスは、システム保守や天災等の不可抗力により、本サービスの全部または一部の提供を停止または中断することがあります。</p>,
  },
  {
    title: "第6条（著作権）",
    body: <p>本サービスを通じて提供される画像等のコンテンツに関する著作権は、当サービスまたは正当な権利者に帰属します。利用者は、ライセンス条件に従って利用するものとします。</p>,
  },
  {
    title: "第7条（免責事項）",
    body: <p>当サービスは、利用者に生じた損害について、当サービスの故意または重過失による場合を除き、一切の責任を負いません。</p>,
  },
  {
    title: "第8条（規約の変更）",
    body: <p>当サービスは、必要と判断した場合には、利用者に通知することなく本規約を変更できるものとします。変更後の規約は、本ページに掲載された時点から効力を生じるものとします。</p>,
  },
  {
    title: "第9条（準拠法・裁判管轄）",
    body: <p>本規約の解釈には日本法を準拠法とし、本サービスに関して紛争が生じた場合には、東京地方裁判所を専属的合意管轄とします。</p>,
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Momentia 利用規約</h1>
        <p className="text-sm text-neutral-600">
          この利用規約（以下「本規約」）は、Momentia（以下「当サービス」）が提供するサービスの利用条件を定めるものです。利用者は、本サービスを利用することにより本規約に同意したものとみなされます。
        </p>
      </header>

      <section className="space-y-8">
        {clauses.map((clause) => (
          <article key={clause.title} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-neutral-900">{clause.title}</h2>
            <div className="mt-3 text-sm text-neutral-700 leading-relaxed">
              {clause.body}
            </div>
          </article>
        ))}
      </section>

      <footer className="mt-10 text-xs text-neutral-500">制定日: 2025年9月2日</footer>
    </main>
  );
}
