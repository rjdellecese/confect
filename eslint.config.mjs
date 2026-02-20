// @ts-check
/// <reference types="node" />

import eslint from "@eslint/js";
import * as mdx from "eslint-plugin-mdx";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.pnpm-store/**",
      "**/.tsup/**",
      "**/_generated/**",
      "**/.mintlify/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-warning-comments": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-shadow": "warn",
    },
  },

  // apps/example
  {
    files: ["apps/example/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // apps/docs
  {
    ...mdx.flat,
    files: ["apps/docs/**/*.{md,mdx}"],
  },

  {
    files: [
      "**/*.js",
      "**/*.mjs",
      "**/eslint.config.js",
      "**/eslint.config.mjs",
      "**/vite.config.ts",
      "**/vitest.config.ts",
      "**/vitest.shared.ts",
      "**/tsdown.shared.ts",
      ".cursor/hooks/**/*.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    ...tseslint.configs.disableTypeChecked[0],
  },
];
