import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Absolute path to the @confect/cli entry point. Resolved from this file's
// location rather than relying on a `confect` bin in `node_modules/.bin/`,
// which is brittle in CI: `pnpm install` runs before workspace packages are
// built, so the bin link for `confect` ends up dangling until something
// re-links it.
const confectCliEntry = resolve(
  import.meta.dirname,
  "../../cli/dist/index.mjs",
);

/**
 * Build a Vitest `globalSetup` that runs `confect codegen` against the
 * given fixture directory before the suite starts.
 *
 * The CLI walks up from `process.cwd()` to find the nearest `package.json`
 * (see `@confect/cli`'s `ProjectRoot`), which it then treats as the project
 * root when locating the Convex directory. Each fixture project therefore runs
 * codegen with the fixture directory as the child process cwd.
 *
 * Codegen runs both locally and on CI. The fixtures' generated outputs
 * (`confect/_generated/` and the wrapper files under `convex/`) are committed
 * to the repo, and CI verifies via `git diff --exit-code` that codegen
 * produces no changes — i.e. that the committed outputs are up-to-date.
 */
export const setupForFixture =
  (baseDir: string, fixtureSubpath: string) => async () => {
    await execFileAsync(process.execPath, [confectCliEntry, "codegen"], {
      cwd: resolve(baseDir, fixtureSubpath),
    });
  };
