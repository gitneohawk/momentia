# ---------------- Stage 1: 依存関係のインストール ----------------
FROM node:20-alpine AS deps
WORKDIR /app

# postinstallでのprisma generateの失敗を防ぐため、prismaスキーマを先にコピー
COPY prisma ./prisma/
COPY package*.json ./
RUN npm install

# ---------------- Stage 2: ビルダー ----------------
FROM node:20-alpine AS builder
WORKDIR /app

# 依存関係をコピー
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Clientを明示的に生成
RUN npx prisma generate

# アプリケーションをビルド
# .env.production があればここで読み込まれる
RUN npm run build

# ---------------- Stage 3: ランナー（本番環境） ----------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# ★Prismaの実行に必要なシステムライブラリをインストール
RUN apk add --no-cache openssl libc6-compat

# ビルダーから、Next.jsのスタンドアロン成果物と静的ファイルだけをコピー
# standaloneモードは、実行に必要なnode_modulesも自動で含めてくれます
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# ポートを指定
EXPOSE 3000
ENV PORT 3000

# サーバーを起動
CMD ["npm", "run", "start:prod"]