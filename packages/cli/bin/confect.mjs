#!/usr/bin/env node

// The `confect` bin points at this committed shim rather than at the tsdown
// output directly: pnpm only creates command shims for bin targets that exist
// at install time, and in a fresh checkout `pnpm install` runs before `dist/`
// is built, which would otherwise leave the bin missing until a re-install.
try {
  await import("../dist/index.mjs");
} catch (error) {
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_MODULE_NOT_FOUND" &&
    error.message.includes("dist/index.mjs")
  ) {
    console.error(
      "@confect/cli's build output is missing. Run `pnpm build` from the repo root " +
        "(or `vp run --filter @confect/cli dev` for a watcher) first.",
    );
    process.exit(1);
  }
  throw error;
}
