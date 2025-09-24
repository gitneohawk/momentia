// prisma.config.js
module.exports = {
  schema: './prisma/schema.prisma',
  dotenv: '.env', // ここで .env を読ませる（必要なら）
  // 追加設定があればここに追記できます
  // migrations: { path: './prisma/migrations' },
};