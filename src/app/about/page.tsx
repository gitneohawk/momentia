import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="bg-neutral-50 py-12 sm:py-16">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 rounded-3xl bg-white px-6 py-10 shadow-sm ring-1 ring-black/5 sm:px-10">
        <header className="space-y-3 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Momentiaについて
          </h1>
          <p className="text-sm text-neutral-600 sm:text-base">
            Momentia は Evoluzio Inc. が運営するフォトレーベルです。静けさや余白を感じる瞬間を写真で切り取り、空間に寄り添うアートとしてお届けしています。
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-neutral-900">ビジョン</h2>
          <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
            何気ない風景やかすかな光にも、心を整えてくれる力が宿っています。Momentia は、その小さな感動を丁寧に掬い上げ、暮らしやオフィスに持ち運べる形へと仕立てます。写真がひとつあるだけで会話が生まれ、場の空気が変わる。その体験を多くの人に届けたいと考えています。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-neutral-900">制作とプリント</h2>
          <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
            作品は撮影からレタッチ、プリントまで一貫してこだわり抜いています。デジタルデータは長辺 4K 相当（約 3840px）の高解像度 JPEG として提供し、パネル作品は信頼するプロラボでプリントし丁寧に仕上げています。商用利用は規約順守のうえ許可していますが、再配布・再販売・第三者への譲渡、二次販売目的のグッズ化などはお断りしています。企業の会議室や店舗、そして個人のリビングにも馴染むよう、過度な装飾を避けたニュートラルな表現を大切にしています。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-neutral-900">フォトグラファー</h2>
          <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
            Momentia には複数のフォトグラファーが参加し、それぞれの視点から作品を発表しています。最新の参加メンバーや略歴は下記のページからご覧ください。
          </p>
          <div>
            <Link
              href="/photographers"
              className="inline-flex items-center rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              フォトグラファー紹介を見る
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-neutral-900">オーダーについて</h2>
          <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
            デジタルデータのライセンス販売に加え、A2 パネルを中心としたプリント作品をご用意しています。導入のご相談や特別なサイズでの制作など、柔軟に対応いたします。
          </p>
          <p className="text-xs text-neutral-500 sm:text-sm">
            ※ 現在は日本国内のお客さまのみご購入いただけます。海外発送は承っておりません。
          </p>
        </section>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/gallery"
            className="inline-flex items-center rounded-full bg-black px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            ギャラリーを見る
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
          >
            お問い合わせ
          </Link>
        </div>
      </div>
    </main>
  );
}
