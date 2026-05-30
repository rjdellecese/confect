// Verify per-field consistency across published @confect/* packages.
import { readFileSync } from "node:fs";

const files = [
  "packages/cli/package.json",
  "packages/core/package.json",
  "packages/js/package.json",
  "packages/react/package.json",
  "packages/server/package.json",
  "packages/test/package.json",
];

const fields = ["author", "license", "homepage", "repository", "bugs"];

let failed = false;
for (const field of fields) {
  const valuesByPath = new Map();
  for (const file of files) {
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    const key = JSON.stringify(pkg[field]);
    if (!valuesByPath.has(key)) valuesByPath.set(key, []);
    valuesByPath.get(key).push(file);
  }
  if (valuesByPath.size > 1) {
    console.error(`✗ "${field}" differs across @confect/* packages:`);
    for (const [value, paths] of valuesByPath) {
      console.error(`  ${value}`);
      for (const p of paths) console.error(`    ${p}`);
    }
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("✓ @confect/* package metadata is consistent");
