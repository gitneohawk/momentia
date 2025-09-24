# デプロイ手順（Azure Container Apps + Stripe + Prisma）

Momentia プロジェクトの Azure Container Apps を用いたデプロイ手順をまとめます。Stripe 決済連携および Prisma マイグレーションも含みます。

---

## 事前準備

- Azure アカウントと CLI を準備済み（`az login` でログイン）
- リポジトリをローカルにクローン済み
- `.env` ファイルをルートに配置し、必要な環境変数を設定
  - Azure Blob Storage 接続文字列、Entra ID（Azure AD）クライアントID・シークレット
  - Stripe シークレットキー（テスト・本番環境用）
  - Prisma DATABASE_URL（Azure Database for PostgreSQL など）
- Docker がインストールされている場合はローカルビルドも可能

---

## デプロイ手順

1. **Azure リソースの準備**

   - リソースグループ作成（例）:
     ```
     az group create --name momentia-rg --location japaneast
     ```
   - Container Apps 環境作成:
     ```
     az containerapp env create --name momentia-env --resource-group momentia-rg --location japaneast
     ```
   - ストレージアカウントやデータベースも必要に応じて作成

2. **アプリケーションのビルドとコンテナ化**

   - ローカルでビルド:
     ```
     npm install
     npm run build
     ```
   - Docker イメージビルド（Dockerfile がある場合）:
     ```
     docker build -t momentia-app:latest .
     ```
   - イメージを Azure Container Registry (ACR) にプッシュする場合は ACR を作成し、ログイン後プッシュ

3. **Container App の作成・更新**

   - ローカルソースから直接デプロイ可能:
     ```
     az containerapp up --name momentia-app --resource-group momentia-rg --environment momentia-env --source .
     ```
   - または ACR のイメージを指定してデプロイ

4. **環境変数の設定**

   - Azure Portal または CLI で環境変数を設定
   - `.env` にあるキーを Container App の設定に反映

5. **Prisma マイグレーション**

   - Azure Database に接続できる状態でマイグレーションを実行:
     ```
     npx prisma migrate deploy
     ```
   - 必要に応じてローカルや CI/CD パイプラインで実行

6. **Stripe Webhook の設定**

   - Stripe ダッシュボードで Webhook エンドポイントを追加
   - Container App のパブリック URL + `/api/stripe/webhook` を指定
   - Webhook シークレットを `.env` に設定し、アプリで検証

7. **カスタムドメインと HTTPS**

   - Azure Container Apps のカスタムドメイン設定を行う
   - DNS レコードを設定し、HTTPS（TLS）を有効化

---

## デプロイ後の確認

- アプリケーションの URL にアクセスし、正常に動作するか確認
- Stripe のテストモードで購入フローを検証
- Blob Storage の画像がプライベート設定であることを確認
- HTTPS 強制、CORS ポリシーが適切に設定されているか確認
- ログやモニタリング（App Insights など）でエラーがないかチェック

---

## 補足: npm スクリプト例

package.json に以下のようなスクリプトを用意すると便利です。

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "prisma migrate deploy",
    "dev": "nodemon src/index.ts"
  }
}
```

これにより、`npm run build` や `npm run migrate` でビルドやマイグレーションを簡単に実行できます。

---

以上の手順を踏むことで、Momentia の Azure Container Apps への安全かつスムーズなデプロイが可能です。問題が発生した場合はログや設定を見直し、Azure と Stripe のドキュメントも参照してください。
