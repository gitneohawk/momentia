# Momentia デプロイメントガイド

最終更新日: 2025-09-19

## 前提条件
- 適切な権限を持つ Azure アカウントが有効であること
- Azure CLI をインストール済み: https://docs.microsoft.com/ja-jp/cli/azure/install-azure-cli
- コンテナイメージをローカルでビルドする場合は Docker をインストール: https://docs.docker.com/get-docker/
- Node.js と npm がローカルビルド用にインストールされていること
- プロジェクトリポジトリへのアクセス権およびデプロイに必要な環境変数が揃っていること
- `.env` ファイルが必要なキー（Azure Blob, Entra ID, Stripe キー等）で正しくセットアップされていること。`.env.sample` を参照してください。

## ローカルビルド手順
1. リポジトリをクローン（未取得の場合）:
   ```
   git clone <repository-url>
   cd momentia
   ```
2. 依存パッケージのインストール:
   ```
   npm install
   ```
3. プロジェクトのビルド:
   ```
   npm run build
   ```
4. （任意）テストの実行:
   ```
   npm test
   ```

## Azure へのデプロイ手順
1. Azure CLI にログイン:
   ```
   az login
   ```
2. 必要に応じてサブスクリプションを指定:
   ```
   az account set --subscription "<subscription-id>"
   ```
3. 必要な Azure リソース（リソースグループ、Container App 環境、ストレージアカウント等）の作成または更新
4. ビルド済みアプリケーションを Azure Container Apps へデプロイ:
   ```
   az containerapp up --name <container-app-name> --resource-group <resource-group> --environment <environment-name> --source .
   ```
5. Azure ポータルまたは CLI で環境変数・アプリ設定を構成
6. 静的アセットやコンテナイメージを必要に応じて Azure Blob Storage または Container Registry へデプロイ

## デプロイ後の確認事項
- デプロイ先 URL でアプリケーションが正しく動作するか確認
- `ROADMAP.md` のフラグを最新状態に更新
- 購入フローを Stripe サンドボックスキーで検証済みであることを明記し、問題がないか再度テスト
- **Blob Storage のセキュリティ:** Azure Blob コンテナが *Private* になっていることを確認。画像URLへの直接アクセスを防止し、SASトークン（短期間有効）や保護されたルート経由で画像を配信
- **HTTPS/TLS の強制:** App Service で HTTPS のみアクセス可能であることを確認
- **CORS 設定:** 信頼できるドメインのみに CORS を制限していることを確認
- **決済ゲートウェイ（Stripe）設定:** Stripe の本番・サンドボックスキーが正しく設定され、Webhook エンドポイントも構成済みであること。サンドボックス/本番両方のフローで動作確認済み
- ログやパフォーマンスメトリクスを監視し、問題があれば対応

- ✅ カスタムドメイン設定済み（momentia.evoluzio.com, DNS + Container Apps バインディング）

---

上記の手順に従うことで、Momentia プロジェクトの安全かつ円滑なデプロイ・運用が可能です。

## デプロイチェックリスト
- ✅ デプロイ済み URL でアプリケーションがアクセス可能
- ✅ ログイン/セッション（Entra ID）が正常に動作
- ✅ Stripe サンドボックスキーで購入フローを検証済み
- ✅ Stripe Webhook が構成済み
- ✅ Blob Storage 内の画像が直接アクセス不可
- ✅ HTTPS のみ・CORS ポリシーが適用されている
- ✅ Azure（App Insights等）でモニタリング・アラートが設定済み
