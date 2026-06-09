import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "tsdown --config-loader unrun && tsc -b tsconfig.src.json",
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
