import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "tsdown --config-loader unrun && tsrs -b tsconfig.src.json",
        cache: {
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
  },
});
