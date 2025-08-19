// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 既存を消すなら（必要なければコメントアウトのままでOK）
  // await prisma.post.deleteMany();

  const baseDate = new Date("2025-08-01T09:00:00Z");
  const data = Array.from({ length: 12 }).map((_, i) => {
    const n = i + 1;
    return {
      slug: `seed-post-${n}`,
      title: `シード記事 ${n}`,
      description: `ページネーション確認用のシード記事 ${n} です。`,
      tags: n % 2 === 0 ? ["blog", "seed"] : ["photography"],
      published: true,
      publishedAt: new Date(baseDate.getTime() + i * 86400000),
      heroPath: "",
      bodyMdx: `---
title: シード記事 ${n}
description: ページネーション確認用のシード記事です。
date: ${new Date(baseDate.getTime() + i * 86400000).toISOString()}
tags: [${n % 2 === 0 ? '"blog","seed"' : '"photography"'}]
---

# シード記事 ${n}

これは **Prisma seed** から投入された記事です。MDX なので *強調* や **太字** も使えます。

- 連番: ${n}
- タグ: ${n % 2 === 0 ? "blog, seed" : "photography"}

> ギャラリーは /gallery、ブログ一覧は /blog からどうぞ。
`,
    };
  });

  await prisma.post.createMany({ data });
  console.log("✅ Seed inserted:", data.length, "posts");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });