import type { OxfmtConfig } from "vite-plus/fmt";

export default {
  trailingComma: "all",
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  printWidth: 80,
  jsdoc: {
    capitalizeDescriptions: true,
    commentLineStrategy: "multiline",
    descriptionWithDot: true,
    lineWrappingStyle: "greedy",
    preferCodeFences: true,
    separateTagGroups: true,
  },
  sortPackageJson: false,
  ignorePatterns: ["**/_generated/**", "**/fixtures/convex/**/*.ts"],
} satisfies OxfmtConfig;
