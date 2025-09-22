# ブログ用ミニCMS実装計画

## 優先度が高いタスク
1. Azure Container AppsとDNSでカスタムドメイン（momentia.evoluzio.com）を設定
2. ブログ画像用に別のAzure Blobコンテナを用意（ギャラリーとは別）
3. 決済フローを実装（Stripe Checkoutによる国内消費税対応、日本限定を優先。PayPalは後でオプションとして追加）
4. 問い合わせフォームの実装（注文IDを紐付け、管理画面で確認可能にする）
5. [x] 注文ステータス管理（paid/processing/shipped/canceled）と管理画面からの更新機能（完了）

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

7. **受注管理と問い合わせ**
   - Orderモデルに`status`フィールドを追加（完了）
   - 管理画面でステータス更新可能にする（完了）
   - 問い合わせフォームを設置し、ContactMessageモデルに保存
   - 管理画面から問い合わせ一覧・詳細を確認できるようにする

## メモ
- 初期バージョンはテキスト＋画像のみ。高度なMDXコンポーネントは後で追加可能。
- スタイリングは現行の`prose`タイポグラフィ設定と一貫性を保つ。y
- 決済はまずStripe Checkoutを導入、PayPalは後で追加可能。Amazon Payは将来的に検討。

## モバイルUX & パフォーマンス

- [x] ランディング: Featured Works（モバイル）
  - [x] A案: スマホでは非表示（`hidden md:block`）（実装済み・デプロイ済み）
  - [ ] B案: 2列グリッド（最大4枚）＋「もっと見る」→ /gallery
  - [ ] サムネ `sizes="(max-width: 640px) 50vw, 33vw"`

- [ ] Lightbox: ウォーターマーク画像の事前生成
  - [ ] Upload時に `photos/wm/<slug>_wm_2048.jpg` を生成（sharpで合成）
  - [ ] `/api/wm/[slug]` は存在チェック→あれば302、無ければ生成→保存→302
  - [ ] Blobに `Cache-Control: public, max-age=31536000, immutable` を設定
  - [ ] ファイル名に `wm` のバージョンを含める（例 `_wm-v2_`）
  - メモ: 現状は表示時に生成、Upload時生成は未実装

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

- [ ] 本番キャッシュ/TTL
  - [ ] public画像: CDN長期キャッシュ
  - [ ] `/api/photos`: `s-maxage=60, stale-while-revalidate=600`
  - [ ] SAS TTL: thumb/large=30–60分、wm=24h

- [ ] Lightbox 2048対応
  - [ ] 2048pxはPC向けのみ提供、モバイルは480pxを利用
  - [ ] 将来的に1024pxバリアントを追加しsrcset対応
  - [ ] /api/photos: largeはSAS発行に切替、thumbは公開URLのまま
  - メモ: 初期対応はモバイルでの速度優先、セキュリティ確保のため2048は非公開運用

## デプロイ・運用メモ

- [ ] 背景色を固定のライトに（`globals.css`で`color-scheme: light`、`min-height: 100svh`を設定）
- [ ] デプロイ後のモバイルレイアウト確認（Pixel9a実機確認済み）
- [ ] ACAメトリクスを監視。Front Door導入でCDN/アクセスログも検討