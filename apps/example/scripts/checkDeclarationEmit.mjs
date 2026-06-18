// Declaration-emit smoke test.
//
// Confect's public types must emit compact, *named* `.d.ts` declarations so a
// Confect backend can be consumed as a referenced (composite) TypeScript
// project. This guards that property: it runs `tsc` over the example backend
// with `declaration` + `emitDeclarationOnly` and fails if
//
//   1. declaration emit reports `TS7056` (inferred type too large to
//      serialize) or `TS4020` (extends clause uses a private name), or
//   2. a generated `.d.ts` exceeds a size ceiling — a proxy for a structural
//      type being expanded inline instead of printed by name (which would
//      eventually trip TS7056 on a larger schema).
//
// Run from `apps/example` via `pnpm check:declarations`.

import { execFileSync } from "node:child_process";
import { rmSync, statSync } from "node:fs";

const OUT_DIR = ".tsdeclcheck";
const PROJECT = "tsconfig.declcheck.json";

// Ceilings in bytes. These sit comfortably above current output but well below
// the multi-hundred-KB expansions that regressions produce.
const SIZE_LIMITS = {
  ".tsdeclcheck/confect/_generated/services.d.ts": 30_000,
};

rmSync(OUT_DIR, { recursive: true, force: true });

let tscOutput = "";
let tscFailed = false;
try {
  tscOutput = execFileSync("tsc", ["-p", PROJECT, "--pretty", "false"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  tscFailed = true;
  tscOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}

const overflow = tscOutput
  .split("\n")
  .filter((line) => /error TS7056|error TS4020/.test(line));

if (overflow.length > 0) {
  console.error("✘ Declaration emit overflowed (TS7056 / TS4020):\n");
  console.error(overflow.join("\n"));
  process.exit(1);
}

if (tscFailed) {
  console.error("✘ Declaration build failed:\n");
  console.error(tscOutput);
  process.exit(1);
}

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

console.log("\n✔ Declaration emit is compact and overflow-free.");
