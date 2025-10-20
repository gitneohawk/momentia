# スケジュール
公開時期は今月中ではなく、必要なセキュリティ確認（ペネトレーションテスト含む）と
tulip画像のA2プリント仕上がり確認（10月第2週予定）完了後に設定する。
まずは必須機能（Stripe 決済、デジタルデータDLリンク、問い合わせフォーム、CMS基本機能）を揃え、
次にセキュリティテスト・カスタムドメイン設定・FUJIFILM申請を完了させてからリリースする。
デザイン最適化やモバイルUX調整はリリース後に対応する。

# ブログ用ミニCMS実装計画

## 優先度が高いタスク
1. Azure Container AppsとDNSでカスタムドメイン（momentia.evoluzio.com）を設定
2. [x] ブログ画像用に別のAzure Blobコンテナを用意（ギャラリーとは別／プライベート運用・API配信）
3. [x] 決済フローを実装（Stripe Checkout：国内消費税対応・日本限定／購入完了メール連携）
4. [x] 問い合わせフォームの実装（DB保存・管理画面一覧/詳細・自動返信/運営通知メール）
5. [x] 注文ステータス管理（paid/processing/shipped/canceled）と管理画面からの更新機能（完了）
6. [x] デジタル販売用の画像をピクセル揃えて出力（長辺2400pxに統一／sharp生成）
7. [x] 値段表示を調整：デジタル商品は「（税込）」、パネル商品は「（送料込み・税込）」と明記（全画面反映済み）
8. [x] ペネトレーションテストを実施（認証・決済・管理画面／APIを対象に、外部委託＋自動スキャンの二段構え）
9. ログ／監視／アラートを整備（Azure Monitor・Container Apps・PostgreSQL・Stripe Webhook失敗の監視と通知）
10. [x] フォトグラファー管理＆ギャラリーフィルタ機能を追加（マルチ写真家対応の基盤整備）

## 目的
記事を追加・編集するたびにGitHubへコミットせずに済む、軽量なブログ用CMSを実装する。

## タスク
1. **データベース設定**
   - Prismaスキーマに`Post`モデルを追加し、以下のフィールドを設定:
     - id (string, cuid)
     - title (string)
     - slug (string, unique)
     - description (string, optional)
     - content (Markdown/MDX string)
     - hero (string, optional - image path)
     - tags (string array, optional)
     - date (DateTime)
     - published (boolean, default: false)
     - createdAt / updatedAt (DateTime)
   - `prisma migrate dev`を実行してデータベースを更新

2. **APIエンドポイント**
   - `GET /api/blog` → 記事一覧取得（ページネーション、公開済みのみフィルタリング）
   - `GET /api/blog/[slug]` → 単一記事取得
   - `POST /api/blog` → 記事作成（管理者のみ）
   - `PUT /api/blog/[id]` → 記事更新（管理者のみ）
   - `DELETE /api/blog/[id]` → 記事削除（管理者のみ）

3. **管理画面UI (/admin/blog)**
   - 記事一覧と「新規作成」ボタン
   - タイトル、スラッグ、説明、ヒーロー画像URL、タグ、内容の編集フォーム
   - MDXプレビュー機能
   - 認証・認可（管理者のみアクセス可能）

4. **フロントエンド統合**
   - ブログページはローカル`.mdx`ファイルではなくAPIから取得
   - `published`フラグを考慮し、公開記事のみ表示

5. **デプロイ関連事項**
   - 環境変数（DB URLや管理者認証シークレット等）をAzureに設定
   - DBはAzure Managed PostgreSQL等を利用
   - 既存の`.mdx`記事をデータベースへ移行

6. **セキュリティとアクセス制御**
   - Blobストレージはプライベート設定（匿名アクセス禁止）
   - 画像配信はSASトークンまたはAPIストリーミングを利用
   - 管理用エンドポイントは認証必須
   - アップロードやAPIルートにレート制限・サイズ制限を適用
   - 本番前に脆弱性診断（SAST/DAST）と手動ペンテ（優先度高）
   - 依存パッケージの監視（Dependabot／npm audit）と署名付きリリースの採用を検討
- [ ] メール送信における入力サニタイズとヘッダインジェクション対策（`\r\n` 除去、本文はXSSサニタイズ済み）
- [ ] 本番リリース前に管理者認可方式を **RBAC（Entra ID App Roles / Groups）** に移行（現状はメールドメインで暫定許可）

## 監視・ログ・アラート計画
- **アプリ／インフラ監視**
  - Azure Container Apps: `az containerapp logs show` の常用に加え、Diagnostic settings で Log Analytics へ転送
  - メトリクス: 5xx レート、レスポンスタイム、CPU/メモリ、スケール回数
  - アラート: 5xx > 1%（5分）、p95 レイテンシ > 2s、コンテナ再起動連続発生、スケール上限到達
- **DB監視**
  - Azure Database for PostgreSQL: 接続エラー、CPU/IO、長時間クエリ
  - アラート: 接続失敗レート上昇、ディスク残量 15% 未満
- **ストレージ監視**
  - Blob 4xx/5xx、SAS 期限切れエラー
- **アプリケーションログ**
  - 重要イベントを構造化 JSON で出力（注文作成、ステータス変更、Webhook バリデーション失敗など）
  - ログレベル: `info`/`warn`/`error` を明確化、PII マスク
  - `/api/photos` の info ログは本番環境で抑制済み（`logInfo` ヘルパーで NODE_ENV と DEBUG_API_PHOTOS 環境変数で制御）
- **外部サービス**
  - Stripe: Webhook 失敗の再試行を許可し、失敗時にメール／Teams 通知
- **運用 Runbook**
  - 重大障害対応手順／連絡先／ロールバック手順を `docs/ops-runbook.md` に整備

## メモ
- 初期バージョンはテキスト＋画像のみ。高度なMDXコンポーネントは後で追加可能。
- スタイリングは現行の`prose`タイポグラフィ設定と一貫性を保つ。
- 決済はまずStripe Checkoutを導入、PayPalは後で追加可能。Amazon Payは将来的に検討。

## 追加タスク（ブログ／OGP）
- [ ] /blog 一覧・詳細で `heroPath` をサムネイル／OGP 画像に利用（未設定時はデフォルト画像を表示）
- [ ] OGPデフォルト画像（ロゴ入り）を `public/ogp-default.png` として用意し共通化
- [ ] /admin/blog/new にアップロードUIを統合済みだが、`heroPath` 必須バリデーションをAPI側でも担保

## モバイルUX & パフォーマンス

- [x] ランディング: Featured Works（モバイル）
  - [x] A案: スマホでは非表示（`hidden md:block`）（実装済み・デプロイ済み）
  - [ ] B案: 2列グリッド（最大4枚）＋「もっと見る」→ /gallery
  - [ ] サムネ `sizes="(max-width: 640px) 50vw, 33vw"`

- [x] Lightbox: ウォーターマーク画像の事前生成
  - [x] Upload時に `photos/watermarks/<slug>_wm_2048_v1.jpg` を生成（sharpで合成済み・動作検証済み）
  - [x] `/api/wm/[slug]` は存在チェック→あれば302、無ければ生成→保存→302
  - [ ] Blobに `Cache-Control: public, max-age=31536000, immutable` を設定
  - [x] ファイル名に `wm` のバージョンを含める（例 `_wm-v2_`）
  - メモ: 現状は表示時に生成、Upload時生成は未実装
  - 更新: `/api/wm/[slug]` とアップロード時の生成フローは `lib/watermark.ts` を使った内部生成に変更済み。BlobのCache-Control設定は未対応。
  - 追記 (2025-10-14): Upload時の内部生成は `lib/watermark.ts` で実装済み。`/api/wm/[slug]` は存在チェック→未生成なら合成→保存→302 で稼働中。
  - 注記: 保存先は `watermarks/<slug>_wm_2048_v1.jpg`（`photos/watermarks` ではない）。
  - TODO: Blob `Cache-Control: public, max-age=31536000, immutable` の設定は未対応（本番適用前に実装）。

- [ ] ランディング: ヒーロー画像最適化
  - [ ] 出力幅: 640/960/1280/1600/1920 を生成（AVIF/WebP優先）
  - [ ] `<Image priority sizes="(max-width:640px) 100vw, (max-width:1024px) 90vw, 1200px">`
  - [ ] blurDataURLプレースホルダを設定
  - [ ] 目標: LCP画像 < 200KB
  - メモ: 1920px WebP/JPEG最適化画像はデプロイ済み。レスポンシブの複数サイズ・blurDataURLは未対応

- [ ] ギャラリー体験
  - [ ] 初期ロードを12枚に制限、以降“もっと見る”で追加ロード
  - [ ] `rowConstraints.minPhotos: 1`（少枚数でも崩れない）
  - [ ] サムネは480px（DPR2向けに960pxまで許容）
  - 新規: ギャラリー速度最適化（Suspense、CSRフォールバック、SAS TTL設定）を完了。

- [x] 本番キャッシュ/TTL
  - [x] public画像: CDN長期キャッシュ
  - [x] `/api/photos`: `s-maxage=60, stale-while-revalidate=600`
  - [x] SAS TTL: thumb/large=30–60分、wm=24h

- [ ] Lightbox 2048対応
  - [ ] 2048pxはPC向けのみ提供、モバイルは480pxを利用
  - [ ] 将来的に1024pxバリアントを追加しsrcset対応
  - [ ] /api/photos: largeはSAS発行に切替、thumbは公開URLのまま
  - メモ: 初期対応はモバイルでの速度優先、セキュリティ確保のため2048は非公開運用

## デプロイ・運用メモ

- [x] 背景色を固定のライトに（`globals.css`で`color-scheme: light`、`min-height: 100svh`を設定）
- [ ] デプロイ後のモバイルレイアウト確認（Pixel9a実機確認済み）
- [ ] ACAメトリクスを監視。Front Door導入でCDN/アクセスログも検討
- [ ] Container Apps の Diagnostic settings で Log Analytics に送信（AppLogs/IngressLogs/KubeEvents）
- [ ] アラート 5xx, レイテンシ, CPU/メモリ, Postgres 接続エラーを作成
- [ ] Stripe Webhook 失敗を Dashboard のアラートメールに追加
- [ ] 監視設定の IaC 化（Bicep/Terraform もしくは `az monitor` スクリプト）
- [ ] ACS 送信ログを Log Analytics に転送し、配信失敗割合のアラートを作成
- [x] Stripe Webhook のイベント処理ログに `orderId` / `customerEmail` を必ず含める（PIIは必要最小限）
- [x] 管理画面の注文一覧を JST 表示に統一
- [ ] Stripe Webhook テスト手順をドキュメント化（Stripe CLI でのフォワード含む）
- [ ] リリース前にテスト注文・AccessToken をクリアする手順を用意
- [ ] 本番リリース時に HTTP Header（Content-Security-Policy等）の再検討を行う（開発環境ではデバッグ用に緩和したCSPを使用しており、本番環境では厳格なCSP、Referrer-Policy、Permissions-Policyを再導入予定）

## 問い合わせフォーム / メール通知関連

- [x] 送信基盤：Azure Communication Services（ACS）＋ `evoluzio.com` Verified Domain を使用
  - From: `noreply@evoluzio.com`（ACS sender username 登録済み）
  - Reply-To: `info@evoluzio.com`
  - ログ: 送信リクエストとMessageIdを `info` で記録（失敗は `error`）
- [x] 問い合わせフォーム：DB保存 → ユーザー自動返信 ＆ 運営通知メール（/admin/inquiries で閲覧）
- [x] 決済完了通知メール（Stripe Webhook）
  - デジタル：ダウンロードURL（`/api/download?token=...`）を含む購入者メール＋運営通知
  - パネル：出荷目安テキストを含む購入者メール＋運営通知
- [x] リトライ：5xx 時の指数バックオフ（mailer.ts に実装）
- [ ] バウンス／配信失敗の検知とアラート（Log Analytics → アラート or メール）
- [ ] 迷惑メール対策：本文と件名の調整、SPF/DKIM/DMARC の継続モニタリング（ACS 側ステータス）

## ドメイン方針
- momentia.photo → ブランド用公式ドメイン（Webサービス用）
- evoluzio.com → 運営会社ドメイン（決済・問い合わせメール送信用）

## リリースチェックリスト

- [ ] Stripe 本番キー・Webhook設定
- [ ] `ALLOWED_CHECKOUT_EMAILS` を本番運用向けに設定（テスト用ホワイトリストを解除／公開時のメール制限確認）
- [ ] カスタムドメイン + HTTPS 有効化
- [ ] ペネトレーションテスト完了
- [ ] ログ／監視／アラート 最低限稼働
- [ ] 問い合わせフォーム／決済成功・失敗動作の確認
- [ ] メール送信の到達性確認（Gmail / Outlook / 携帯キャリア）
- [ ] 本番リリース直前にテスト用 Order / AccessToken / Invoice を削除
