import * as PlatformNodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { realpath } from "node:fs";

export const withNativeRealPath = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  native: (
    file: string,
    complete: (error: NodeJS.ErrnoException | null, resolved: string) => void,
  ) => void = realpath.native,
): FileSystem.FileSystem => ({
  ...fs,
  realPath: Effect.fnUntraced(function* (file: string) {
    const resolved = yield* Effect.callback<Option.Option<string>>((resume) => {
      try {
        const absolute = path.resolve(file);
        native(absolute, (error, canonical) =>
          resume(
            error || canonical !== absolute
              ? Effect.succeedNone
              : Effect.succeedSome(canonical),
          ),
        );
      } catch {
        resume(Effect.succeedNone);
      }
    });
    return Option.isSome(resolved) ? resolved.value : yield* fs.realPath(file);
  }),
});

export const layer = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (process.platform !== "win32") return fs;
    return withNativeRealPath(fs, yield* Path.Path);
  }),
).pipe(Layer.provideMerge(PlatformNodeServices.layer));
