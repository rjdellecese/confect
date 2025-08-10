// @ts-check
import eslint from "@eslint/js";
import * as mdx from "eslint-plugin-mdx";

export default [
  eslint.configs.recommended,
  {
    ...mdx.flat,
    files: ["**/*.{md,mdx}"],
    rules: {
      ...mdx.flat.rules,
    },
  },
  {
    ignores: ["node_modules/**", ".mintlify/**"],
  },
];
