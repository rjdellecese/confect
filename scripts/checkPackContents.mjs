// Guards what actually ends up in the published tarballs.
//
// Every published package uses `files: ["dist", ...]`, which is an allowlist of
// directories, not of files — so anything a build step happens to leave inside
// `dist` ships to npm. That is how `dist/tsconfig.src.tsbuildinfo` went out in
// every release until it was noticed by hand. This asks npm for the exact file
// list it would pack and fails on anything that has no business being there.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES_DIR = "packages";

/** Files that must never reach a consumer, with the reason shown on failure. */
const DENIED = [
  [/\.tsbuildinfo$/, "TypeScript incremental build cache"],
  [/(^|\/)node_modules\//, "nested node_modules"],
  [/(^|\/)coverage\//, "coverage report"],
  [/\.(test|spec)\.[cm]?[jt]sx?$/, "test file"],
  [/(^|\/)__tests__\//, "test directory"],
  [/(^|\/)\.env(\.|$)/, "environment file"],
  [/(^|\/)\.DS_Store$/, "macOS metadata"],
  [/\.log$/, "log file"],
  [/(^|\/)tsconfig(\..+)?\.json$/, "TypeScript config"],
];

const publishedPackages = () =>
  readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name))
    .filter((dir) => {
      try {
        return (
          JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
            .private !== true
        );
      } catch {
        return false;
      }
    });

const packedFiles = (dir) => {
  const stdout = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(stdout)[0].files.map((file) => file.path);
};

let failed = false;

for (const dir of publishedPackages()) {
  const files = packedFiles(dir);
  const problems = [];

  // A package that packs no build output means the check ran before `pnpm
  // build` — passing here would be vacuous, so treat it as a failure.
  if (!files.some((path) => path.startsWith("dist/"))) {
    problems.push([
      "dist/",
      "no build output packed — did this run before `pnpm build`?",
    ]);
  }

  for (const path of files) {
    const denial = DENIED.find(([pattern]) => pattern.test(path));
    if (denial) problems.push([path, denial[1]]);
  }

  if (problems.length === 0) {
    console.log(`ok  ${dir} (${files.length} files)`);
    continue;
  }

  failed = true;
  console.error(`FAIL ${dir}`);
  for (const [path, reason] of problems)
    console.error(`       ${path} — ${reason}`);
}

if (failed) {
  console.error(
    "\nThese files would be published to npm. Keep build artifacts out of the packed directories,",
    "\nor narrow the `files` field in the offending package.json.",
  );
  process.exit(1);
}
