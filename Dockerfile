# 依存解決
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ビルド
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 実行
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next standalone 成果物と静的ファイルだけコピー
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# ★ ポートは ACA の targetPort と一致させる（3000に揃えるのが無難）
ENV PORT=3000
EXPOSE 3000

# ★ ここが肝：standalone の server.js を1つだけ起動
CMD ["node", "server.js"]