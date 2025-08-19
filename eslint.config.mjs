import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Base: Next.js + TypeScript rules, then relax a few noisy ones to unblock CI.
export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Global tweaks
  {
    rules: {
      // TEMP: allow any in early MVP server code
      "@typescript-eslint/no-explicit-any": "off",
      // Keep notices but don't fail build for minor unused vars
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      // We deliberately use plain <img> in a few places (lightbox thumbs etc.)
      "@next/next/no-img-element": "off",
    },
  },
  // You can tighten rules per area later; example for API routes:
  {
    files: ["src/app/api/**/*.{ts,tsx}"],
    rules: {
      // place future stricter rules here
    },
  },
];
