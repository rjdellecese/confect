import path from "node:path";
import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { ConvexHttpClient } from "convex/browser";
import {
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Schema,
  Stream,
} from "effect";

class BackendNotReadyError extends Schema.TaggedError<BackendNotReadyError>()(
  "BackendNotReadyError",
  { message: Schema.String },
) {}

export class LocalBackend extends Context.Tag(
  "@confect/server/test/end-to-end/LocalBackend",
)<LocalBackend, { readonly client: ConvexHttpClient }>() {}

const SERVER_PACKAGE_DIR = path.resolve(import.meta.dirname, "../..");
const READY_LINE = "Convex functions ready!";
const URL = "http://127.0.0.1:3210";

// Knobs read by `crates/common/src/knobs.rs` in `convex-backend`. Lowering
// these shrinks `MAX_CACHE_AGE` (`crates/application/src/cache/mod.rs:106-113`)
// to a few seconds so a single test run can comfortably wait past the
// cache eviction window.
const USER_TIMEOUT_SECONDS = 1;
const SYSTEM_TIMEOUT_SECONDS = 1;

/**
 * Duration after which a query whose handler observed time (e.g. via
 * `Date.now()`, `setTimeout`, `Effect.sleep`) is evicted from the local
 * backend's reactive cache. Per `crates/application/src/cache/mod.rs`,
 * `MAX_CACHE_AGE = USER_TIMEOUT + SYSTEM_TIMEOUT + 1s`. Exported so tests
 * can wait `Duration.sum(maxCacheAge, slack)` instead of hard-coding a
 * magic number that has to be kept in sync with the env vars below.
 */
export const maxCacheAge = Duration.seconds(
  USER_TIMEOUT_SECONDS + SYSTEM_TIMEOUT_SECONDS + 1,
);

/**
 * Spawn `convex dev` from `packages/server/` (which already targets
 * `test/convex/` via `convex.json`) with reduced UDF timeouts so that
 * `MAX_CACHE_AGE = total_query_timeout + 1s ≈ 3s` in the local-backend
 * Rust process. The CLI keeps the local backend alive for the lifetime
 * of the layer's scope and is signalled on scope close.
 *
 * Once the backend is ready, a single `ConvexHttpClient` is constructed
 * and exposed through the service, shared by every test case so we don't
 * pay the per-call construction cost or risk multiple clients drifting
 * out of sync.
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
const make = Effect.gen(function* () {
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
      DATABASE_UDF_USER_TIMEOUT_SECONDS: USER_TIMEOUT_SECONDS.toString(),
      DATABASE_UDF_SYSTEM_TIMEOUT_SECONDS: SYSTEM_TIMEOUT_SECONDS.toString(),
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
        new BackendNotReadyError({
          message: `convex dev did not print "${READY_LINE}" within 90s (cold-start binary download?)`,
        }),
    }),
  );

  return yield* Option.match(seenReady, {
    onSome: () =>
      Effect.succeed(LocalBackend.of({ client: new ConvexHttpClient(URL) })),
    onNone: () =>
      Effect.fail(
        new BackendNotReadyError({
          message: `convex dev exited before printing "${READY_LINE}"`,
        }),
      ),
  });
});

export const layer = Layer.scoped(LocalBackend, make).pipe(
  Layer.provide(NodeContext.layer),
);
