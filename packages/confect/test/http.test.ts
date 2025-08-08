import { describe, expect } from "@effect/vitest";
import { Effect } from "effect";
import { TestConvexService } from "./TestConvexService";
import { effect } from "./test_utils";

describe("http", () => {
  describe("/", () => {
    effect("user-defined endpoint", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const response = yield* c.fetch("/get", { method: "GET" });

        const jsonBody = yield* Effect.promise(() => response.json());
        const status = response.status;

        expect(status).toEqual(200);
        expect(jsonBody).toEqual("Hello, world!");
      }),
    );

    effect("api docs", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const response = yield* c.fetch("/docs", { method: "GET" });

        const status = response.status;

        expect(status).toEqual(200);
      }),
    );
  });

  describe("/path-prefix", () => {
    effect("user-defined endpoint", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const response = yield* c.fetch("/path-prefix/get", { method: "GET" });

        // const jsonBody = yield* Effect.promise(() => response.json());
        const status = response.status;

        expect(status).toEqual(200);
        // expect(jsonBody).toEqual("Hello, world!");
      }),
    );

    effect("api docs", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const response = yield* c.fetch("/path-prefix/docs", { method: "GET" });

        const status = response.status;

        expect(status).toEqual(200);
      }),
    );
  });
});
