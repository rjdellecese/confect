#!/usr/bin/env node

/**
 * The `confect` bin points at this committed shim rather than at the tsdown
 * output directly: pnpm only creates command shims for bin targets that exist
 * at install time, and in a fresh checkout `pnpm install` runs before `dist/`
 * is built, which would otherwise leave the bin missing until a re-install.
 *
 * @module
 */

import { existsSync } from "node:fs";

const entry = new URL("../dist/index.mjs", import.meta.url);

if (!existsSync(entry)) {
  console.error(
    "@confect/cli's build output is missing. Run `pnpm build` from the repo root " +
      "(or `vp run --filter @confect/cli dev` for a watcher) first.",
  );
  process.exit(1);
}

await import(entry.href);
