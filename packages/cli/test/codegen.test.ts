import { Command, FileSystem, Path } from "@effect/platform";
import { expect, layer, vi } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { NodeContext } from "@effect/platform-node";
import { cliApp } from "../src/cliApp";

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const testDir = import.meta.dirname;
  const cliPackageDirectory = path.join(testDir, "..");
  const serverPackageDirectory = path.join(cliPackageDirectory, "..", "server");
  const corePackageDirectory = path.join(cliPackageDirectory, "..", "core");
  const fixturesDirectory = path.join(testDir, "fixtures");
  const tempDirectory = yield* fs.makeTempDirectory();

  yield* Effect.sync(() =>
    vi.spyOn(process, "cwd").mockReturnValue(tempDirectory),
  );

  yield* fs.copy(fixturesDirectory, tempDirectory);

  if (!(yield* fs.exists(path.join(tempDirectory, "pnpm-lock.yaml")))) {
    yield* fs.remove(path.join(tempDirectory, "pnpm-lock.yaml"));
  }
  if (!(yield* fs.exists(path.join(tempDirectory, "node_modules")))) {
    yield* fs.remove(path.join(tempDirectory, "node_modules"), {
      recursive: true,
    });
  }
  if (!(yield* fs.exists(path.join(tempDirectory, "confect", "_generated")))) {
    yield* fs.remove(path.join(tempDirectory, "confect", "_generated"), {
      recursive: true,
    });
  }

  expect(
    yield* Command.make(
      "pnpm",
      "link",
      "--config.confirmModulesPurge=false",
      corePackageDirectory,
    ).pipe(Command.workingDirectory(tempDirectory), Command.exitCode),
  ).toStrictEqual(0);

  expect(
    yield* Command.make(
      "pnpm",
      "link",
      "--config.confirmModulesPurge=false",
      serverPackageDirectory,
    ).pipe(Command.workingDirectory(tempDirectory), Command.exitCode),
  ).toStrictEqual(0);

  return { tempDirectory };
});

const teardown = Effect.sync(() => vi.restoreAllMocks());

layer(NodeContext.layer)("codegen", (it) => {
  it.effect(
    "generates the correct files",
    () =>
      Effect.gen(function* () {
        const { tempDirectory } = yield* setup;

        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const exit = yield* Effect.exit(cliApp(["node", "confect", "codegen"]));
        expect(exit).toStrictEqual(Exit.void);

        expect(
          yield* fs.exists(
            path.join(tempDirectory, "confect", "_generated", "services.ts"),
          ),
        );
        expect(
          yield* fs.exists(
            path.join(tempDirectory, "confect", "_generated", "refs.ts"),
          ),
        );
        expect(
          yield* fs.exists(path.join(tempDirectory, "convex", "schema.ts")),
        );
        expect(
          yield* fs.exists(path.join(tempDirectory, "convex", "notes.ts")),
        );

        const exitCode = yield* Command.make("npx", "tsc").pipe(
          Command.workingDirectory(tempDirectory),
          Command.stdout("inherit"),
          Command.stderr("inherit"),
          Command.exitCode,
        );

        expect(exitCode).toStrictEqual(0);

        yield* teardown;
      }),
    {
      timeout: 60_000,
    },
  );
});
