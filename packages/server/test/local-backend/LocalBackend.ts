import * as NodeServices from "@effect/platform-node/NodeServices";
import { ConvexHttpClient } from "convex/browser";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

class BackendNotReadyError extends Schema.TaggedErrorClass<BackendNotReadyError>()(
  "BackendNotReadyError",
  { message: Schema.String },
) {}

export class LocalBackend extends Context.Service<
  LocalBackend,
  { readonly client: ConvexHttpClient }
>()("@confect/server/test/local-backend/LocalBackend") {}

const READY_LINE = "Convex functions ready!";
const URL = "http://127.0.0.1:3210";

// Knobs read by `crates/common/src/knobs.rs` in convex-backend. Lowering
// these shrinks `MAX_CACHE_AGE` (= `USER_TIMEOUT` + `SYSTEM_TIMEOUT` + 1s,
// per `crates/application/src/cache/mod.rs`) to ~3s so a single test run
// can wait past the cache eviction window.
const USER_TIMEOUT_SECONDS = 1;
const SYSTEM_TIMEOUT_SECONDS = 1;

/**
 * Duration after which a query whose handler observed time is evicted from
 * the local backend's reactive cache. Exported so tests can derive their
 * sleep from it rather than hard-coding a magic number.
 */
export const maxCacheAge = Duration.seconds(
  USER_TIMEOUT_SECONDS + SYSTEM_TIMEOUT_SECONDS + 1,
);

/**
 * Spawn `convex dev` from `test/local-backend/fixtures/` with reduced UDF
 * timeouts. The CLI keeps the local backend alive for the lifetime of the
 * scope and is signalled on scope close; the `ConvexHttpClient` is shared
 * by every test case.
 *
 * `.convex/` and `.env.local` are intentionally preserved between runs so
 * the CLI takes the "existing deployment" path and skips boilerplate
 * codegen that would otherwise overwrite committed fixture files.
 */
const make = Effect.gen(function* () {
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner;
  const fixturesDir = path.resolve(import.meta.dirname, "./fixtures");

  const command = ChildProcess.make(
    "pnpm",
    [
      "convex",
      "dev",
      "--typecheck=disable",
      "--codegen=disable",
      "--tail-logs=disable",
    ],
    {
      cwd: fixturesDir,
      // Without extendEnv, `env` replaces the child's entire environment and
      // `pnpm` falls off PATH.
      extendEnv: true,
      env: {
        CONVEX_AGENT_MODE: "anonymous",
        DATABASE_UDF_USER_TIMEOUT_SECONDS: USER_TIMEOUT_SECONDS.toString(),
        DATABASE_UDF_SYSTEM_TIMEOUT_SECONDS: SYSTEM_TIMEOUT_SECONDS.toString(),
      },
    },
  );

  const handle = yield* spawner.spawn(command);

  // If the streams close before READY_LINE appears, `Stream.runHead` returns
  // `None` and we fail explicitly rather than letting the timeout hide it.
  const readySeen = yield* handle.all.pipe(
    Stream.decodeText(),
    Stream.filter((chunk) => chunk.includes(READY_LINE)),
    Stream.runHead,
    Effect.timeoutOrElse({
      duration: "90 seconds",
      orElse: () =>
        Effect.fail(
          new BackendNotReadyError({
            message: `convex dev did not print "${READY_LINE}" within 90s (cold-start binary download?)`,
          }),
        ),
    }),
  );

  return yield* Option.match(readySeen, {
    onSome: () => Effect.succeed({ client: new ConvexHttpClient(URL) }),
    onNone: () =>
      Effect.fail(
        new BackendNotReadyError({
          message: `convex dev exited before printing "${READY_LINE}"`,
        }),
      ),
  });
});

export const layer = Layer.effect(LocalBackend, make).pipe(
  Layer.provide(NodeServices.layer),
);
