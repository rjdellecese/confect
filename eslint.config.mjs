// @ts-check
/// <reference types="node" />

import eslint from "@eslint/js";
import * as mdx from "eslint-plugin-mdx";
import unicorn from "eslint-plugin-unicorn";
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
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    plugins: {
      unicorn,
    },
    rules: {
      "unicorn/filename-case": [
        "error",
        { cases: { camelCase: true, pascalCase: true } },
      ],
    },
  },

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

  // Enforce submodule Effect imports across the repo. `import { Schema } from
  // "effect"` pulls the entire namespace because esbuild can't tree-shake property
  // access on the barrel's re-exports, so a single barrel import re-pins all of
  // Schema/Stream/etc. (see bench/ATTRIBUTION.md §5). `import * as Schema from
  // "effect/Schema"` tree-shakes — and is the import style Effect v4 recommends.
  // Type-only imports are exempt; @effect/vitest is exempt (test utilities).
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "effect",
              message:
                'Import Effect modules from their submodule path so they tree-shake, e.g. `import * as Schema from "effect/Schema"`. Bare helpers (pipe, flow, identity) come from "effect/Function".',
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              regex: "^@effect/(?!vitest)[^/]+$",
              message:
                'Import @effect/* modules from their submodule path so they tree-shake, e.g. `import * as Path from "@effect/platform/Path"`.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },

  // apps/docs
  {
    ...mdx.flat,
    files: ["apps/docs/**/*.{md,mdx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_|^[A-Z]",
          ignoreRestSiblings: true,
        },
      ],
    },
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
