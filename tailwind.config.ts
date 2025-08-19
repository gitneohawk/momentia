import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "./content/**/*.{md,mdx}" // ← MDXファイルも対象に
  ],
  theme: { extend: {} },
  plugins: [typography],
} satisfies Config;

module.exports = {
  // ...
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'], // デフォルトのフォントをInterに
        serif: ['var(--font-lora)', 'serif'],     // セリフ体用のクラスを追加
      },
    },
  },
}