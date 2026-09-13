import * as BunFileSystem from "@effect/platform-bun/BunFileSystem";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

export const clean = Effect.fn("Clean.remove")(function* (
  targets: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;

  for (const target of targets) {
    yield* fs.remove(target, { recursive: true, force: true });
  }
});

if (import.meta.main) {
  clean(Bun.argv.slice(2)).pipe(
    Effect.provide(BunFileSystem.layer),
    BunRuntime.runMain,
  );
}
