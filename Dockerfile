# 本番環境専用のDockerfile

# ---------- deps ----------
FROM node:22.22.0-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package*.json ./
COPY .npmrc .npmrc
RUN npm ci --ignore-scripts

# ---------- builder ----------
FROM node:22.22.0-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY . .
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build

# ---------- runner ----------
FROM node:22.22.0-alpine AS runner
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
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p /app/.next/cache && \
    chmod -R a+r /app/public && \
    chown -R node:node /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server.js"]
