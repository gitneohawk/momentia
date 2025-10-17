# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package*.json ./
RUN npm ci --ignore-scripts

# ---------- development ----------
FROM deps AS development
WORKDIR /app

# フォント描画に必要なパッケージをインストール
RUN apk add --no-cache fontconfig ttf-dejavu font-noto

# 'deps'ステージからインストール済みのnode_modulesをコピー
COPY --from=deps /app/node_modules ./node_modules
# プロジェクトの全ファイルをコピー
COPY . .

# Prisma Clientを生成
RUN npx prisma generate

# 開発サーバーが使用するポートを公開
EXPOSE 3000

# 開発サーバーを起動するコマンド
CMD ["npm", "run", "dev"]
# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Prisma schema を必ず含める（.dockerignore に入っているとビルドに乗らないので注意）
COPY prisma ./prisma
# アプリ本体
COPY . .
# Prisma Client 生成（スキーマはこの時点で存在）
RUN npx prisma generate --schema prisma/schema.prisma
# Next のビルド（キャッシュは任意）
#RUN --mount=type=cache,target=/app/.next/cache \
#    npm run build
RUN npm run build
# ---------- runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache \
  libc6-compat \
  openssl \
  fontconfig \
  ttf-dejavu \
  font-noto
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Prisma クライアントのバイナリとスキーマをランタイムにも同梱
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
# Next.js 画像最適化のキャッシュ作成とパーミッション整備 / Prisma クライアント含む全体を node に委譲
RUN mkdir -p /app/.next/cache && \
    chmod -R a+r /app/public && \
    chown -R node:node /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server.js"]