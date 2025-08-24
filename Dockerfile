# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package*.json ./
# dev依存も入るように（NODE_ENV=production をここで付けない）
# RUN --mount=type=cache,target=/root/.npm \
#    npm ci --ignore-scripts
RUN npm ci --ignore-scripts

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma Client 生成（スキーマはこの時点で存在）
RUN npx prisma generate
# Next のビルド（キャッシュは任意）
#RUN --mount=type=cache,target=/app/.next/cache \
#    npm run build
RUN npm run build
# ---------- runner ----------
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]