import { defineConfig } from "vite-plus";

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
