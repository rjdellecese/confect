import { expect, layer } from "@effect/vitest";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ConvexConfigProvider from "@confect/server/ConvexConfigProvider";

// oxlint-disable effecttsgo/process-env -- This harness must manipulate the real environment to test Convex's non-enumerable process.env provider.
const replaceEnv = (key: string, value: string | undefined): (() => void) => {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  return () => {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  };
};
// oxlint-enable effecttsgo/process-env

const withEnv = <A, E, R>(
  key: string,
  value: string | undefined,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => replaceEnv(key, value)),
    () => effect,
    (restore) => Effect.sync(restore),
  );

layer(ConvexConfigProvider.layer)("ConvexConfigProvider", (it) => {
  it.effect("resolves an environment variable by exact key", () =>
    withEnv(
      "CONFECT_TEST_PRESENT",
      "value",
      Effect.gen(function* () {
        const value = yield* Config.string("CONFECT_TEST_PRESENT");
        expect(value).toBe("value");
      }),
    ),
  );

  it.effect("joins path segments with underscores", () =>
    withEnv(
      "CONFECT_TEST_NESTED",
      "value",
      Effect.gen(function* () {
        const value = yield* Config.string("NESTED").pipe(
          Config.nested("CONFECT_TEST"),
        );
        expect(value).toBe("value");
      }),
    ),
  );

  it.effect(
    "treats an empty string as missing, recoverable with a default",
    () =>
      withEnv(
        "CONFECT_TEST_EMPTY",
        "",
        Effect.gen(function* () {
          const option = yield* Config.option(
            Config.string("CONFECT_TEST_EMPTY"),
          );
          expect(Option.isNone(option)).toBe(true);

          const value = yield* Config.string("CONFECT_TEST_EMPTY").pipe(
            Config.withDefault("fallback"),
          );
          expect(value).toBe("fallback");
        }),
      ),
  );

  it.effect("treats an unset variable as missing", () =>
    withEnv(
      "CONFECT_TEST_UNSET",
      undefined,
      Effect.gen(function* () {
        const option = yield* Config.option(
          Config.string("CONFECT_TEST_UNSET"),
        );
        expect(Option.isNone(option)).toBe(true);
      }),
    ),
  );
});
