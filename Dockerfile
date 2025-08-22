# ---------------- Stage 1: ビルダー ----------------
# アプリケーションをビルドするための環境
FROM node:20-alpine AS builder

# 作業ディレクトリを設定
WORKDIR /app

# 依存関係をインストール
COPY package*.json ./

# ★ここが修正点：npm install の前に prisma ディレクトリをコピーする
COPY prisma ./prisma/

RUN npm install

# Prisma Clientを生成（念のため明示的に実行）
RUN npx prisma generate

# ソースコードをコピー
COPY . .

# アプリケーションをビルド
RUN npm run build

# ---------------- Stage 2: ランナー ----------------
# 実際にアプリケーションを実行するための、軽量な本番環境
FROM node:20-alpine AS runner

WORKDIR /app

# 本番環境であることを設定
ENV NODE_ENV production

# ビルダーから必要なファイルだけをコピー
# 1. スタンドアロンサーバー
COPY --from=builder /app/.next/standalone ./
# 2. 静的ファイル（CSS, JSなど）
COPY --from=builder /app/.next/static ./.next/static
# 3. publicフォルダ内のファイル（画像など）
COPY --from=builder /app/public ./public

# アプリケーションが使用するポートを公開
EXPOSE 3000
ENV PORT 3000

# アプリケーションを起動
CMD ["node", "server.js"]