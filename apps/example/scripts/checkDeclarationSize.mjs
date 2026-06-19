// Size canary for the declaration-emit smoke test (run after `tsc -p
// tsconfig.declcheck.json` — see `package.json`'s `check:declarations`).
//
// `tsc` itself fails the build on `TS7056` (inferred type too large to
// serialize) / `TS4020`, so that overflow is already guarded by the compiler.
// This only adds a canary: a generated `.d.ts` exceeding its ceiling means a
// public type started expanding inline instead of printing by name — which
// would eventually trip `TS7056` on a larger schema than this example's.

import { statSync } from "node:fs";

// Sits well above current output (~5.6 KB) but far below the multi-hundred-KB
// expansions a regression produces.
const SIZE_LIMITS = {
  ".tsdeclcheck/confect/_generated/services.d.ts": 30_000,
};

let ok = true;
for (const [file, limit] of Object.entries(SIZE_LIMITS)) {
  const { size } = statSync(file);
  const status = size <= limit ? "✔" : "✘";
  console.log(`${status} ${file}: ${size} bytes (limit ${limit})`);
  if (size > limit) ok = false;
}

if (!ok) {
  console.error(
    "\n✘ A generated declaration exceeded its size ceiling — a public type is " +
      "likely expanding inline instead of printing by name.",
  );
  process.exit(1);
}

console.log("\n✔ Declaration emit is compact.");
