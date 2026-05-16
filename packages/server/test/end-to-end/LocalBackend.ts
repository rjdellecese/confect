import { Command, FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Context, Effect, Layer, Option, Stream } from "effect";

class BackendNotReadyError extends Error {
  readonly _tag = "BackendNotReadyError";
}

export class LocalBackend extends Context.Tag(
  "@confect/server/test/end-to-end/LocalBackend",
)<LocalBackend, { readonly url: string }>() {}

const READY_LINE = "Convex functions ready!";

const RESET_PATHS = [".convex", ".env.local"] as const;

/**
 * Spawn `convex dev` from `packages/server/` (which already targets
 * `test/convex/` via `convex.json`) with reduced UDF timeouts so that
 * `MAX_CACHE_AGE = total_query_timeout + 1s ≈ 3s` in the local-backend
 * Rust process. The CLI keeps the local backend alive for the lifetime
 * of the layer's scope and is signalled on scope close.
 */
const acquire = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const serverPackageDir = path.resolve(import.meta.dirname, "../..");

  // Reset deployment state to a known-good blank slate every run so this
  // test does not interact with whatever the developer last did locally.
  yield* Effect.forEach(
    RESET_PATHS,
    (relative) =>
      fs
        .remove(path.join(serverPackageDir, relative), {
          recursive: true,
          force: true,
        })
        .pipe(Effect.ignore),
    { discard: true },
  );

  const command = Command.make(
    "pnpm",
    "convex",
    "dev",
    "--typecheck=disable",
    "--codegen=disable",
    "--tail-logs=disable",
  ).pipe(
    Command.workingDirectory(serverPackageDir),
    Command.env({
      CONVEX_AGENT_MODE: "anonymous",
      // Knobs read by `crates/common/src/knobs.rs` in `convex-backend`.
      // `MAX_CACHE_AGE = USER_TIMEOUT + SYSTEM_TIMEOUT + 1s`, so this gives
      // us ~3s before a time-observed query is evicted from the cache.
      DATABASE_UDF_USER_TIMEOUT_SECONDS: "1",
      DATABASE_UDF_SYSTEM_TIMEOUT_SECONDS: "1",
    }),
    Command.stdout("pipe"),
    Command.stderr("pipe"),
  );

  // `Command.start` is scoped: when this layer's scope closes, the process
  // (and its child local-backend) is signalled and reaped automatically.
  const process = yield* Command.start(command);

  // Find the first chunk containing READY_LINE. If the streams close first
  // (process exited), `Stream.runHead` returns `None` and we fail explicitly
  // — otherwise a runaway misconfiguration would silently hang up to 90s.
  const seenReady = yield* Stream.merge(process.stdout, process.stderr).pipe(
    Stream.decodeText("utf-8"),
    Stream.find((chunk) => chunk.includes(READY_LINE)),
    Stream.runHead,
    Effect.timeoutFail({
      duration: "90 seconds",
      onTimeout: () =>
        new BackendNotReadyError(
          `convex dev did not print "${READY_LINE}" within 90s (cold-start binary download?)`,
        ),
    }),
  );
  if (Option.isNone(seenReady)) {
    return yield* Effect.fail(
      new BackendNotReadyError(
        `convex dev exited before printing "${READY_LINE}"`,
      ),
    );
  }

  return LocalBackend.of({ url: "http://127.0.0.1:3210" });
});

export const layer = Layer.scoped(LocalBackend, acquire).pipe(
  Layer.provide(NodeContext.layer),
);
