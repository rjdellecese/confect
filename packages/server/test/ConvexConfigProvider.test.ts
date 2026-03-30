import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Config, Effect, Exit } from "effect";
import * as ConvexConfigProvider from "../src/ConvexConfigProvider";

const withEnv = <A, E>(
  env: Record<string, string>,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const originals: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(env)) {
        originals[key] = process.env[key];
        process.env[key] = value;
      }
      return originals;
    }),
    () => effect,
    (originals) =>
      Effect.sync(() => {
        for (const [key, original] of Object.entries(originals)) {
          if (original === undefined) delete process.env[key];
          else process.env[key] = original;
        }
      }),
  );

describe("ConvexConfigProvider", () => {
  it.effect("loads a string value from process.env", () =>
    withEnv({ TEST_VALUE: "hello" }, Config.string("TEST_VALUE")).pipe(
      Effect.withConfigProvider(ConvexConfigProvider.make()),
      Effect.tap((value) => Effect.sync(() => assertEquals(value, "hello"))),
    ),
  );

  it.effect("fails with MissingData when variable not found", () =>
    Effect.gen(function* () {
      delete process.env["MISSING_KEY"];
      const exit = yield* Config.string("MISSING_KEY").pipe(
        Effect.withConfigProvider(ConvexConfigProvider.make()),
        Effect.exit,
      );
      assertTrue(Exit.isFailure(exit));
    }),
  );

  it.effect("uses custom path delimiter", () =>
    withEnv(
      { "APP-DB-HOST": "localhost" },
      Config.string("HOST").pipe(Config.nested("DB"), Config.nested("APP")),
    ).pipe(
      Effect.withConfigProvider(
        ConvexConfigProvider.make({ pathDelim: "-" }),
      ),
      Effect.tap((value) =>
        Effect.sync(() => assertEquals(value, "localhost")),
      ),
    ),
  );

  it.effect("enumerateChildren returns Unsupported", () =>
    Effect.gen(function* () {
      const exit = yield* Config.hashMap(Config.string("SOME")).pipe(
        Effect.withConfigProvider(ConvexConfigProvider.make()),
        Effect.exit,
      );
      assertTrue(Exit.isFailure(exit));
    }),
  );

  it.effect("trims whitespace from values", () =>
    withEnv({ TRIM_TEST: "  trimmed  " }, Config.string("TRIM_TEST")).pipe(
      Effect.withConfigProvider(ConvexConfigProvider.make()),
      Effect.tap((value) =>
        Effect.sync(() => assertEquals(value, "trimmed")),
      ),
    ),
  );

  it.effect("loads number values correctly", () =>
    withEnv({ PORT: "3000" }, Config.number("PORT")).pipe(
      Effect.withConfigProvider(ConvexConfigProvider.make()),
      Effect.tap((value) => Effect.sync(() => assertEquals(value, 3000))),
    ),
  );

  it.effect("loads boolean values correctly", () =>
    withEnv({ ENABLED: "true" }, Config.boolean("ENABLED")).pipe(
      Effect.withConfigProvider(ConvexConfigProvider.make()),
      Effect.tap((value) => Effect.sync(() => assertEquals(value, true))),
    ),
  );
});
