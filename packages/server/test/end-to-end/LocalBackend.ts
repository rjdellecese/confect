import path from "node:path";
import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Context, Effect, Layer, Option, Stream } from "effect";

class BackendNotReadyError extends Error {
  readonly _tag = "BackendNotReadyError";
}

export class LocalBackend extends Context.Tag(
  "@confect/server/test/end-to-end/LocalBackend",
)<LocalBackend, { readonly url: string }>() {}

const SERVER_PACKAGE_DIR = path.resolve(import.meta.dirname, "../..");
const READY_LINE = "Convex functions ready!";

/**
 * Spawn `convex dev` from `packages/server/` (which already targets
 * `test/convex/` via `convex.json`) with reduced UDF timeouts so that
 * `MAX_CACHE_AGE = total_query_timeout + 1s ≈ 3s` in the local-backend
 * Rust process. The CLI keeps the local backend alive for the lifetime
 * of the layer's scope and is signalled on scope close.
 *
 * We deliberately do NOT clean `.convex/` or `.env.local` between runs.
 * If `.convex/local/default/config.json` exists, the CLI's
 * `chooseDeployment` (in `cli/lib/localDeployment/anonymous.ts`) returns
 * `kind: "existing"` and skips `doInitConvexFolder`, so the boilerplate
 * `README.md` / `tsconfig.json` codegen never runs at all. On a cold
 * machine the boilerplate codegen does run, but the committed
 * `test/convex/README.md` is then preserved by `doReadmeCodegen`'s
 * `skipIfExists` check.
 *
 * Nothing else carried in `.convex/` (deployment name, instance secret,
 * admin key, SQLite shell) interferes with the cache regression test:
 * the in-memory query cache lives inside the per-run backend subprocess
 * and the test fixtures don't write to the database.
 */
const acquire = Effect.gen(function* () {
  const command = Command.make(
    "pnpm",
    "convex",
    "dev",
    "--typecheck=disable",
    "--codegen=disable",
    "--tail-logs=disable",
  ).pipe(
    Command.workingDirectory(SERVER_PACKAGE_DIR),
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
