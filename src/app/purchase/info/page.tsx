export default function PurchaseInfo() {
  return (
    <section className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">ご購入について</h1>
      <p className="mb-6 text-gray-700">
        当サイトでは、高品質なプリントのご注文やデジタルダウンロードが可能です。以下のオプションからお選びいただけます。
      </p>
      <h2 className="text-xl font-semibold mb-2">高品質プリント（A2パネル）</h2>
      <div className="mb-6 text-gray-700 space-y-1">
        <p>A2サイズのグロッシー用紙を使ったプロラボ仕上げのプリントを白パネル加工でお届けします。</p>
        <p>ご注文後に発注するため、発送までに約14日程度かかります。</p>
        <p>価格は送料込み・税込となります。額装は含まれません。</p>
      </div>

      <h2 className="text-xl font-semibold mb-2">デジタルダウンロード</h2>
      <div className="mb-6 text-gray-700 space-y-1">
        <p>長辺2400pxの高品質JPEGデータをご提供します。</p>
        <p>ご購入後すぐにダウンロードリンクが発行され、即時ご利用いただけます。</p>
        <p>透かしは入っていません。個人利用の範囲でご利用いただけます（商用利用は別途ライセンスが必要です）。</p>
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
