import { describe, expect, it } from "@effect/vitest";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ConvexConfigProvider from "@confect/server/ConvexConfigProvider";

describe("ConvexConfigProvider", () => {
  it.effect("resolves an environment variable by exact key", () =>
    Effect.gen(function* () {
      process.env["CONFECT_TEST_PRESENT"] = "value";

      const value = yield* Config.string("CONFECT_TEST_PRESENT");
      expect(value).toBe("value");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => delete process.env["CONFECT_TEST_PRESENT"]),
      ),
      Effect.provide(ConvexConfigProvider.layer),
    ),
  );

  it.effect("joins path segments with underscores", () =>
    Effect.gen(function* () {
      process.env["CONFECT_TEST_NESTED"] = "value";

      const value = yield* Config.string("NESTED").pipe(
        Config.nested("CONFECT_TEST"),
      );
      expect(value).toBe("value");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => delete process.env["CONFECT_TEST_NESTED"]),
      ),
      Effect.provide(ConvexConfigProvider.layer),
    ),
  );

  it.effect(
    "treats an empty string as missing, recoverable with a default",
    () =>
      Effect.gen(function* () {
        process.env["CONFECT_TEST_EMPTY"] = "";

        const option = yield* Config.option(
          Config.string("CONFECT_TEST_EMPTY"),
        );
        expect(Option.isNone(option)).toBe(true);

        const value = yield* Config.string("CONFECT_TEST_EMPTY").pipe(
          Config.withDefault("fallback"),
        );
        expect(value).toBe("fallback");
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => delete process.env["CONFECT_TEST_EMPTY"]),
        ),
        Effect.provide(ConvexConfigProvider.layer),
      ),
  );

  it.effect("treats an unset variable as missing", () =>
    Effect.gen(function* () {
      const option = yield* Config.option(Config.string("CONFECT_TEST_UNSET"));
      expect(Option.isNone(option)).toBe(true);
    }).pipe(Effect.provide(ConvexConfigProvider.layer)),
  );
});
