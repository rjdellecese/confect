// @ts-check

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * Create a base ESLint config for packages.
 * Each package should call this with `import.meta.dirname` to set the correct tsconfigRootDir.
 */
export function createBaseConfig(tsconfigRootDir) {
  return defineConfig([
    {
      ignores: [
        "dist/**",
        "coverage/**",
        "node_modules/**",
        ".pnpm-store/**",
        ".tsup/**",
        "test/convex/_generated/**",
      ],
    },
    {
      extends: [eslint.configs.recommended, tseslint.configs.recommended],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
    },
    {
      files: ["**/*.{ts,tsx}"],
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
    {
      files: ["**/*.js", "**/*.mjs", "eslint.config.js"],
      extends: [tseslint.configs.disableTypeChecked],
    },
  ]);
}

