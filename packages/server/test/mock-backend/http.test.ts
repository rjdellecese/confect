import { describe, expect, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { HttpRouter as ConfectHttpRouter } from "@confect/server";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { DatabaseWriter } from "./fixtures/confect/_generated/services";
import { Id } from "./fixtures/confect/_generated/id";
import { NotesApi } from "./fixtures/confect/http";
import * as TestConfect from "./TestConfect";

describe("HttpRouter", () => {
  it.effect(
    "serves an HttpApi endpoint whose handler uses a Confect service",
    () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const text = "Hello, HTTP!";

        yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;

            return yield* writer.table("notes").insert({ text });
          }),
          Id("notes"),
        );

        const response = yield* c.fetch("/api/notes");
        assertEquals(response.status, 200);

        const body = (yield* Effect.promise(() => response.json())) as Array<{
          text: string;
        }>;
        assertEquals(body.length, 1);
        assertEquals(body[0]?.text, text);
      }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("serves a second HttpApi merged onto the same router", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/meta/ping");
      assertEquals(response.status, 200);
      assertEquals(yield* Effect.promise(() => response.json()), "pong");
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("serves a plain HttpRouter.add route", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/health");
      assertEquals(response.status, 200);
      assertEquals(yield* Effect.promise(() => response.text()), "OK");
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("global middleware modifies responses", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/health");
      assertEquals(response.headers.get("x-confect-middleware"), "applied");
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("serves the Scalar docs page", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/api/docs");
      assertEquals(response.status, 200);
      expect(response.headers.get("content-type")).toContain("text/html");
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect(
    "a plain Convex route on the returned router shadows the catch-all",
    () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const response = yield* c.fetch("/convex-native");
        assertEquals(response.status, 200);
        assertEquals(yield* Effect.promise(() => response.text()), "native");
        // The Effect router (and so its global middleware) never ran.
        assertEquals(response.headers.get("x-confect-middleware"), null);
      }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("unmatched paths get the Effect router's 404", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const response = yield* c.fetch("/no-such-route");
      assertEquals(response.status, 404);
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});

describe("HttpRouter.make type-level guarantees", () => {
  it("rejects a routes layer whose group handlers are not provided", () => {
    // HttpApiBuilder.layer(NotesApi) still requires the NotesApi group handler
    // services; without Layer.provide(NotesApiLive) the layer does not satisfy
    // Routes.
    const _missingGroupLayerIsRejected = () =>
      // @effect-diagnostics-next-line effect/missingLayerContext:off
      // @ts-expect-error
      ConfectHttpRouter.make(HttpApiBuilder.layer(NotesApi));

    expect(_missingGroupLayerIsRejected).toBeDefined();
  });
});
