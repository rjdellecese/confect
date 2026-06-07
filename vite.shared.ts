import { defineConfig } from "vite-plus";

// Shared Vite+ config for the @confect/* library packages, re-exported from each
// package's `vite.config.ts`. The build task lives here (not as a package.json
// script) so Vite+ can cache it: tsdown reads and writes `dist`, a
// read-after-write hazard that blocks caching until those paths are excluded
// from input tracking. `output` archives `dist` so a cache hit restores the
// build artifacts without re-running tsdown. Glob patterns resolve relative to
// each package directory, so this one definition works for every package.
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
