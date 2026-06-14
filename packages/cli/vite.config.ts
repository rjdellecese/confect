import { defineConfig } from "vite-plus";

// Unlike the other packages, `@confect/cli` ships only a binary—it has no
// public API, so its build skips the `tsc -b` declaration-emit step that
// `vite.shared.ts` runs (its sources are typechecked via the root
// `tsconfig.json` instead).
export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "tsdown --config-loader unrun",
        input: [
          { auto: true },
          "!dist/**",
          "!**/.unrun/**",
          "!**/*.tsbuildinfo",
        ],
        output: ["dist/**"],
      },
    },
  },
});
