# CLI process integration tests

These tests launch `bin/confect.mjs` in disposable consumer directories with no generated files. They use the built CLI and workspace package distributions, not Vitest's source aliases. Run `pnpm build` before `pnpm exec vitest run --project @confect/cli test/integration` (CI's shared setup also builds first).

Each consumer has its own package and TypeScript configuration; dependencies resolve through the CLI package's installed dependencies. Tests clean up consumers and child processes through Effect scopes. Output gates coordinate edits and assertions. The bounded quiet-window check intentionally uses real time to detect watcher self-trigger loops.
