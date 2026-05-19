import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { Context, Duration, Effect, Layer, Schema } from "effect";

class BackendNotReadyError extends Schema.TaggedErrorClass<BackendNotReadyError>()(
  "BackendNotReadyError",
  { message: Schema.String },
) {}

export class LocalBackend extends Context.Service<
  LocalBackend,
  { readonly client: ConvexHttpClient }
>()("@confect/server/test/local-backend/LocalBackend") {}

const READY_LINE = "Convex functions ready!";
const CLOUD_PORT = 13210;
const SITE_PORT = 13211;
const URL = `http://127.0.0.1:${CLOUD_PORT}`;

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
const waitForReady = (
  child: ChildProcessWithoutNullStreams,
): Effect.Effect<void, BackendNotReadyError> =>
  Effect.callback<void, BackendNotReadyError>((resume) => {
    let done = false;
    const complete = (effect: Effect.Effect<void, BackendNotReadyError>) => {
      if (!done) {
        done = true;
        resume(effect);
      }
    };
    const onData = (chunk: Buffer | string) => {
      if (String(chunk).includes(READY_LINE)) {
        complete(Effect.void);
      }
    };
    const onError = (error: Error) => {
      complete(
        Effect.fail(new BackendNotReadyError({ message: error.message })),
      );
    };
    const onExit = () => {
      complete(
        Effect.fail(
          new BackendNotReadyError({
            message: `convex dev exited before printing "${READY_LINE}"`,
          }),
        ),
      );
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    const timeout = setTimeout(() => {
      complete(
        Effect.fail(
          new BackendNotReadyError({
            message: `convex dev did not print "${READY_LINE}" within 90s (cold-start binary download?)`,
          }),
        ),
      );
    }, 90_000);

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", onError);
    child.on("exit", onExit);

    return Effect.sync(cleanup);
  });

const make = Effect.gen(function* () {
  const fixturesDir = path.resolve(import.meta.dirname, "./fixtures");

  const child = yield* Effect.acquireRelease(
    Effect.sync(() =>
      spawn(
        "pnpm",
        [
          "convex",
          "dev",
          "--local-cloud-port",
          CLOUD_PORT.toString(),
          "--local-site-port",
          SITE_PORT.toString(),
          "--typecheck=disable",
          "--codegen=disable",
          "--tail-logs=disable",
        ],
        {
          cwd: fixturesDir,
          env: {
            ...process.env,
            CONVEX_AGENT_MODE: "anonymous",
            DATABASE_UDF_USER_TIMEOUT_SECONDS: USER_TIMEOUT_SECONDS.toString(),
            DATABASE_UDF_SYSTEM_TIMEOUT_SECONDS:
              SYSTEM_TIMEOUT_SECONDS.toString(),
          },
        },
      ),
    ),
    (child) =>
      Effect.sync(() => {
        if (!child.killed) {
          child.kill("SIGTERM");
        }
      }),
  );

  yield* waitForReady(child);

  return LocalBackend.of({ client: new ConvexHttpClient(URL) });
});

export const layer = Layer.effect(LocalBackend)(make);
