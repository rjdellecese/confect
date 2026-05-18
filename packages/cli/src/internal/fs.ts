/**
 * Thin Effect-wrappers around Node's `fs/promises` so the Confect CLI can
 * stay agnostic of which platform layer ships with Effect 4.
 *
 * Effect 4 removed `@effect/platform-node`'s `NodeFileSystem.layer`; a v4
 * replacement under `effect/unstable/*` has not landed yet. The CLI's needs
 * are small (read/write/exists/mkdir/readdir/stat), so we bypass the
 * `FileSystem` service entirely here.
 */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { watch as nodeWatch } from "node:fs";
import * as fs from "node:fs/promises";
import nodePath from "node:path";

export class FsError extends Schema.TaggedErrorClass<FsError>()("FsError", {
  op: Schema.String,
  path: Schema.String,
  message: Schema.String,
}) {}

const wrap = <A>(
  op: string,
  path: string,
  thunk: () => Promise<A>,
): Effect.Effect<A, FsError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (error) =>
      new FsError({
        op,
        path,
        message: error instanceof Error ? error.message : String(error),
      }),
  });

export const exists = (path: string): Effect.Effect<boolean> =>
  Effect.promise(() =>
    fs
      .access(path)
      .then(() => true)
      .catch(() => false),
  );

export const readFileString = (
  path: string,
  encoding: BufferEncoding = "utf8",
): Effect.Effect<string, FsError> =>
  wrap("readFileString", path, () => fs.readFile(path, { encoding }));

export const writeFileString = (
  path: string,
  contents: string,
): Effect.Effect<void, FsError> =>
  wrap("writeFileString", path, () => fs.writeFile(path, contents, "utf8"));

export const makeDirectory = (
  path: string,
  options?: { recursive?: boolean },
): Effect.Effect<void, FsError> =>
  wrap("makeDirectory", path, () =>
    fs
      .mkdir(path, { recursive: options?.recursive ?? true })
      .then(() => undefined),
  );

export const readDirectory = (
  path: string,
): Effect.Effect<ReadonlyArray<string>, FsError> =>
  wrap("readDirectory", path, () => fs.readdir(path));

export const stat = (
  path: string,
): Effect.Effect<
  {
    readonly isFile: boolean;
    readonly isDirectory: boolean;
  },
  FsError
> =>
  wrap("stat", path, async () => {
    const s = await fs.stat(path);
    return { isFile: s.isFile(), isDirectory: s.isDirectory() };
  });

export const remove = (
  path: string,
  options?: { recursive?: boolean; force?: boolean },
): Effect.Effect<void, FsError> =>
  wrap("remove", path, () =>
    fs.rm(path, {
      recursive: options?.recursive ?? false,
      force: options?.force ?? false,
    }),
  );

/**
 * Subset of `@effect/platform/FileSystem`'s `WatchEvent` shape that's relevant
 * for the CLI's watcher.
 */
export type WatchEvent =
  | { readonly _tag: "Create"; readonly path: string }
  | { readonly _tag: "Update"; readonly path: string }
  | { readonly _tag: "Remove"; readonly path: string };

const eventFromNode = (
  type: string,
  filename: string | null,
  dir: string,
): WatchEvent | null => {
  if (filename === null) return null;
  const fullPath = nodePath.join(dir, filename);
  if (type === "rename") {
    // Node's `rename` covers both creation and deletion; we surface both as
    // `Update` since the CLI watcher just needs to know "something changed".
    return { _tag: "Update", path: fullPath };
  }
  if (type === "change") {
    return { _tag: "Update", path: fullPath };
  }
  return null;
};

/**
 * Watch a directory for changes, mirroring `@effect/platform/FileSystem.watch`.
 * Emits `WatchEvent`s for both file creations and modifications.
 */
export const watch = (path: string): Stream.Stream<WatchEvent, FsError> =>
  Stream.callback<WatchEvent, FsError>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const watcher = nodeWatch(
          path,
          { persistent: true },
          (eventType, filename) => {
            const event = eventFromNode(eventType, filename, path);
            if (event !== null) {
              Queue.offerUnsafe(queue, event);
            }
          },
        );
        watcher.on("error", (error) => {
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(
              new FsError({
                op: "watch",
                path,
                message: error.message,
              }),
            ),
          );
        });
        return watcher;
      }),
      (watcher) =>
        Effect.sync(() => {
          watcher.close();
        }),
    ),
  );
