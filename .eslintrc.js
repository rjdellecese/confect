module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  overrides: [
    {
      env: {
        node: true,
      },
      files: [".eslintrc.{js,cjs}"],
      parserOptions: {
        sourceType: "script",
      },
    },
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: [
    "@typescript-eslint",
    "unused-imports",
    "simple-import-sort",
    "no-relative-import-paths",
  ],
  ignorePatterns: ["pnpm-lock.yaml"],
  rules: {
    // TODO: Extract common rules to a shared config
    "no-shadow": "error",
    "no-warning-comments": "warn",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "unused-imports/no-unused-imports": "warn",
    "unused-imports/no-unused-vars": [
      "warn",
      {
        vars: "all",
        varsIgnorePattern: "^_",
        args: "after-used",
        argsIgnorePattern: "^_",
      },
    ],
    "no-relative-import-paths/no-relative-import-paths": [
      "warn",
      { rootDir: ".", prefix: "~", allowSameFolder: false },
    ],
    "simple-import-sort/exports": "warn",
    "simple-import-sort/imports": "warn",
    "linebreak-style": ["error", "unix"],
    quotes: ["error", "double"],
    semi: ["error", "always"],
    "@typescript-eslint/no-non-null-assertion": "off",
  },
};
