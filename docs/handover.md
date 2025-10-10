Momentia 開発引き継ぎまとめ

1. プロジェクト概要
	•	プロジェクト名: Momentia
	•	目的: 写真のデジタル販売・パネル販売（Stripe決済）＋ 写真家向けCMS機能
	•	技術基盤: Next.js 15 + TypeScript, Prisma + PostgreSQL (Azure), Azure Container Apps, Azure Communication Services (メール基盤), Stripe Checkout
	•	関連ドメイン
	•	momentia.photo → 公開用ブランドドメイン（本番切替予定）
	•	evoluzio.com → 運営会社ドメイン（決済・問い合わせメール送信用）

⸻

2. ここまでの開発経緯
	•	Stripe Checkout フロー実装（国内消費税対応済み）
	•	ダウンロードリンクを トークン化 → Prisma AccessToken モデル導入
	•	問い合わせフォーム：DB保存＋ユーザ自動返信＋運営通知メール
	•	メール基盤：ACSで noreply/info@evoluzio.com を Verified Sender として利用
	•	管理画面（/admin）に簡易RBAC導入（現状はメールドメイン判定 → 今後Entra ID RBACに移行予定）
	•	A2プリントの品質確認完了
	•	Invoice PDF発行実装 → Stripe Webhookと連携して領収書メールに添付
	•	success画面・メール本文の改善（slug非表示、顧客が理解しやすい表現へ）
	•	監視ログ基盤：Azure Monitor / Log Analytics へ転送確認済み

⸻

3. リリース前の必須タスク
	•	Stripe 本番キー・Webhook設定
	•	カスタムドメイン momentia.photo + HTTPS 化
	•	ペネトレーションテスト
	•	自動スキャン（OWASP ZAP 等）＋簡易手動テスト
	•	ログ／監視／アラート最低限設定
	•	ACAメトリクス（5xx, レイテンシ, CPU/メモリ）
	•	Postgres接続エラー
	•	Stripe Webhook失敗
	•	メール配信失敗（ACSログ → アラート）
	•	robots.txt / sitemap.xml
	•	現状：Disallow: /（公開前に修正必要）
	•	問い合わせフォーム／決済の本番動作確認
	•	成功／失敗両パターン
	•	メール到達性確認（Gmail, Outlook, 携帯キャリア）

⸻

4. リリース後対応予定
	•	ギャラリーUX改善（モバイル向け最適化、ロード制御）
	•	Lightbox透かし画像生成（アップロード時生成）
	•	レスポンシブ画像（640/960/1280/1920幅＋blurDataURL）
	•	OGP画像対応（heroPath必須／デフォルト画像共通化）
	•	RBAC本格導入（Entra ID App Roles / Groups）
	•	IaCによる監視設定自動化（Bicep/Terraform）
	•	SEO最適化（robots/sitemap更新後）

⸻

5. 注意点・失敗しがちなところ
	•	oboeの使い方
	•	フォーカスを当てたファイルしか修正できない → 間違えると他ファイルを壊しかける
	•	修正は「対象ファイルを指定 → oboe → ビルド確認」の順で進めること
	•	メール送信
	•	ACSのSender Usernameは必ずAzureポータルで登録が必要
	•	未登録だと "Invalid email sender username" エラーになる
	•	ダウンロードURL
	•	メールに埋め込む際、/api/download/:token ではなく ?token=... が正解
	•	型エラー
	•	Prisma migrate後は prisma generate と VS Code TSサーバ再起動 が必須
	•	ログ監視
	•	ACAログはアプリケーションログ（info/warn/error）とメトリクス監視を分けて設計
	•	アクセスログは Front Door / CDN 導入を検討中
	•	領収書メール
	•	Stripeからも「控え」メールが飛ぶため、二重送信にならないよう処理済み
	•	文言は「注文確認メールまたは領収書をご確認ください」に統一

⸻

6. リリース直前チェックリスト
	1.	Stripe本番切替
	2.	momentia.photoドメイン設定 & HTTPS
	3.	ペネトレーションテスト実施
	4.	監視・アラート最小構成確認
	5.	問い合わせフォーム／決済 成功＆失敗動作確認
	6.	メール到達性チェック
	7.	robots.txt 修正（公開用に）／ sitemap.xml 公開