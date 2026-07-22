import type { CommandExecutor } from "@effect/platform";
import * as Command from "@effect/platform/Command";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";

const runCommand = (
  command: string,
  args: string[],
): Effect.Effect<void, never, CommandExecutor.CommandExecutor> =>
  Command.make(command, ...args).pipe(
    Command.stderr("inherit"),
    Command.exitCode,
    Effect.andThen((exitCode) =>
      exitCode !== 0
        ? Effect.dieMessage(`${command} failed (exit code ${exitCode})`)
        : Effect.void,
    ),
    Effect.orDie,
  );

// Absolute path to the `confect` bin shim, resolved from this file's
// location rather than via a `confect` bin in `node_modules/.bin/`. The shim
// owns the "build output is missing, run `pnpm build`" pre-flight, so this
// file doesn't need its own existence check on the CLI's `dist/`.
//
// Note: `@confect/cli` is intentionally NOT declared as a (dev)dependency of
// `@confect/server`. The CLI peer-depends on `@confect/server` (its codegen
// emits and type-checks against `@confect/server` imports), so a reciprocal
// dep here would create a cyclic workspace-dependency warning from pnpm. The
// fixture sub-packages under `test/{mock,local}-backend/fixtures` declare
// `@confect/cli` themselves for the `pnpm confect codegen` calls in this
// package's `codegen:*` scripts; this `globalSetup` resolves the binary by
// filesystem path instead, so it does not require the dep graph either.
const confectCliEntryUrl = new URL(
  "../../cli/bin/confect.mjs",
  import.meta.url,
);

/**
 * Build a Vitest `globalSetup` that runs `confect codegen` against the
 * given fixture directory before the suite starts.
 *
 * The CLI walks up from `process.cwd()` to find the nearest `package.json`
 * (see `@confect/cli`'s `ProjectRoot`), which it then treats as the project
 * root when locating the Convex directory. Each fixture project therefore
 * needs to be the cwd while its codegen runs. We chdir for the duration
 * of the codegen call and restore the original cwd via `ensuring`.
 *
 * Codegen runs both locally and on CI. The fixtures' generated outputs
 * (`confect/_generated/` and the wrapper files under `convex/`) are committed
 * to the repo, and CI verifies (via the `verify-codegen-committed` action)
 * that codegen produces no changes—i.e. that the committed outputs are
 * up-to-date.
 */
export const setupForFixture =
  (baseDir: string, fixtureSubpath: string) => () =>
    pipe(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fixtureDir = path.resolve(baseDir, fixtureSubpath);
        const originalCwd = process.cwd();
        const cliEntry = yield* path.fromFileUrl(confectCliEntryUrl);

        yield* Effect.gen(function* () {
          process.chdir(fixtureDir);
          yield* runCommand(process.execPath, [cliEntry, "codegen"]);
        }).pipe(Effect.ensuring(Effect.sync(() => process.chdir(originalCwd))));
      }),
      Effect.provide(NodeContext.layer),
      Effect.runPromise,
    );
