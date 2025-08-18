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