export default function PurchaseInfo() {
  return (
    <section className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">ご購入について</h1>
      <p className="mb-6 text-gray-700">
        当サイトでは、高品質なプリントのご注文やデジタルダウンロードが可能です。以下のオプションからお選びいただけます。
        <br className="hidden sm:block" />
        <span className="text-sm text-gray-500">※ 現在は日本国内のお客さまのみご購入いただけます。</span>
      </p>
      <h2 className="text-xl font-semibold mb-2">高品質プリント（A4/A3/A2パネル）</h2>
      <div className="mb-6 text-gray-700 space-y-1">
        <p>A4/A3/A2サイズのグロッシー用紙を使ったプロラボ仕上げのプリントを白パネル加工でお届けします。</p>
        <p>ご注文後に発注するため、発送までに約14日程度かかります。</p>
        <p>価格は送料込み・税込となります。額装は含まれません。</p>
      </div>

      <h2 className="text-xl font-semibold mb-2">デジタルダウンロード</h2>
      <div className="mb-6 text-gray-700 space-y-1">
        <p>4K相当（約3840px）の高解像度 JPEG データをご提供します。</p>
        <p>ご購入後すぐにダウンロードリンクが発行され、即時ご利用いただけます。</p>
        <p>透かしは入っていません。規約を順守のうえ商用利用が可能ですが、再配布・再販売・第三者への譲渡、二次販売目的のグッズ化などは禁止されています。</p>
      </div>

      <h2 className="text-xl font-semibold mb-2">その他</h2>
      <div className="text-gray-700 space-y-1">
        <p>お支払い方法はStripe（クレジットカード等）をご利用いただけます。</p>
        <p>デジタル商品は性質上キャンセル・返品はできません。プリント商品は不良品の場合のみ再送対応いたします。</p>
        <p>特別なご要望やお問い合わせは info@evoluzio.com までお願いいたします。</p>
      </div>
    </section>
  )
}
