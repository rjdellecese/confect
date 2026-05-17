import { FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { describe, expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import {
  ConvexDirectoryNotFoundError,
  findConvexDirectory,
} from "../src/ConvexDirectory";

/**
 * Creates a fresh tmp dir and restores `process.cwd()` on scope close so
 * tests can freely `chdir` into the directory they want to resolve from.
 */
const tmpRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const originalCwd = process.cwd();
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => process.chdir(originalCwd)),
  );
  return yield* fs.makeTempDirectoryScoped({
    prefix: "confect-convex-dir-",
  });
});

const chdir = (dir: string) => Effect.sync(() => process.chdir(dir));

describe("ConvexDirectory.findConvexDirectory", () => {
  layer(NodeContext.layer)((it) => {
    it.scoped("resolves convex.json found in the current directory", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* tmpRoot;
        const convexDir = path.join(root, "convex");
        yield* fs.makeDirectory(convexDir);
        yield* fs.writeFileString(
          path.join(root, "convex.json"),
          JSON.stringify({ functions: "./convex/" }),
        );
        yield* chdir(root);

        const resolved = yield* findConvexDirectory;

        expect(yield* fs.realPath(resolved)).toBe(
          yield* fs.realPath(convexDir),
        );
      }),
    );

    it.scoped("walks up to find convex.json in an ancestor", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* tmpRoot;
        const convexDir = path.join(root, "api");
        yield* fs.makeDirectory(convexDir);
        yield* fs.writeFileString(
          path.join(root, "convex.json"),
          JSON.stringify({ functions: "./api/" }),
        );
        const childDir = path.join(root, "nested", "deeper");
        yield* fs.makeDirectory(childDir, { recursive: true });
        yield* chdir(childDir);

        const resolved = yield* findConvexDirectory;

        expect(yield* fs.realPath(resolved)).toBe(
          yield* fs.realPath(convexDir),
        );
      }),
    );

    it.scoped(
      "falls back to <cwd>/convex when no convex.json exists on the path",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* tmpRoot;
          const convexDir = path.join(root, "convex");
          yield* fs.makeDirectory(convexDir);
          yield* chdir(root);

          const resolved = yield* findConvexDirectory;

          expect(yield* fs.realPath(resolved)).toBe(
            yield* fs.realPath(convexDir),
          );
        }),
    );

    it.scoped(
      "fails with ConvexDirectoryNotFoundError when the resolved dir does not exist",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* tmpRoot;
          yield* fs.writeFileString(
            path.join(root, "convex.json"),
            JSON.stringify({ functions: "./does-not-exist/" }),
          );
          yield* chdir(root);

          const result = yield* Effect.either(findConvexDirectory);

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(ConvexDirectoryNotFoundError);
          }
        }),
    );
  });
});
