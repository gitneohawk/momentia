# Stripe Webhook テスト手順

本書は Stripe Checkout → Webhook → Order 更新 → メール送信の一連の流れを、開発環境および本番（テストモード）で再現するための手順をまとめたものです。CLI を用いたローカルフォワードと、本番デプロイでの確認ポイントを以下に記載します。

---

## 1. 前提

- Stripe CLI がインストール済みであること（<https://stripe.com/docs/stripe-cli>）。
- `.env.local` に Stripe のテスト用キー類が設定されていること。
- Webhook 秘密鍵は環境ごとに管理する：
  - ローカル開発：`STRIPE_WEBHOOK_SECRET` に CLI が発行した値を設定。
  - 本番（テストモード）：Stripe ダッシュボードの Webhook 設定に記載の値を Azure Container Apps 側の環境変数に設定。

---

## 2. ローカル開発環境でのテスト

1. **Webhook のフォワードを開始**
   ```bash
   stripe listen --forward-to http://localhost:3000/api/stripe/webhook
   ```
   コマンド実行時に表示される `whsec_...` を `.env.local` の `STRIPE_WEBHOOK_SECRET` に設定してサーバーを再起動します。

2. **Checkout セッションを作成**
   - ブラウザで `http://localhost:3000/purchase/<slug>` を開き、テストカード `<4242 4242 4242 4242>` などを使って決済します。
   - Stripe CLI のログに `checkout.session.completed` が流れ、ターミナルにも Webhook 受信ログが表示されることを確認。

3. **結果の確認**
   - ブラウザ：`/purchase/success?session_id=...` に注文情報とダウンロードリンクが表示される。
   - Admin 画面：`/admin/orders` に新しい注文が追加されている。
   - メール：購入者と運営宛に ACS 経由のメールが送信される。ACS のログまたは CLI のログで `mail.send` が `Succeeded` になっているかを確認。

4. **手動トリガー（オプション）**
   既存セッションを再現したい場合は、Stripe CLI で以下を実行してイベントを再送できます。
   ```bash
   stripe trigger checkout.session.completed
   ```

---

## 3. Azure（本番テストモード）での確認

1. Stripe ダッシュボードの Webhook URL が `https://www.momentia.photo/api/stripe/webhook` になっていることを確認し、`STRIPE_WEBHOOK_SECRET` を Azure Container Apps の環境変数に設定（再デプロイが必要）。

2. 本番 URL (`https://www.momentia.photo/purchase/<slug>`) でテストカード決済を行い、ダッシュボードのログと ACA のログで以下を確認：
   - `checkout.session.completed` が無事受信されている。
   - `STRIPE_WEBHOOK_PROCESSING` / `STRIPE_WEBHOOK_OK` ログに `orderId` と `email` が出力されている。

3. `/purchase/success` と `/admin/orders` に反映され、購入者メールが届くことを確認。ダウンロードリンクが `originals/<slug>.jpg` を向いているかも合わせてチェックします。

---

## 4. トラブルシューティング

- **Webhook が 400/401 で失敗する**：`STRIPE_WEBHOOK_SECRET` が環境と一致しているか確認。ローカルでは CLI 実行時に表示される値を `.env.local` に反映する。
- **注文が DB に作成されない**：Webhook が到達していない可能性があります。Stripe CLI のログ、Azure Monitor の App Logs を調べ、`STRIPE_WEBHOOK_RECEIVED` が出ているか確認してください。
- **メールが届かない**：`src/lib/mailer.ts` のログ (`mail.send` / `mail.send.failed`) を確認し、ACS のステータスやリトライ情報を参照します。

---

## 5. テスト後の後片付け

- 開発用の Stripe セッションや AccessToken が不要であれば、`prisma` を使って削除する（`Order`, `AccessToken` テーブルなど）。
- CLI を終了してポートフォワードを止めるには、`stripe listen` を実行しているターミナルで `Ctrl + C` を押すだけで OK です。

---

必要に応じてこの文書を更新し、新しいパターンのテストや異常時の対処が分かるようにしておきましょう。
