import { defineConfig } from "vite-plus";

// Build task defined here (not as a package.json script) so Vite+ can cache it:
// tsdown reads and writes `dist`, a read-after-write hazard that blocks caching
// until those paths are excluded from input tracking. `output` archives `dist`
// so a cache hit restores the build artifacts without re-running tsdown.
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
