import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Client from "@confect/foldkit/Client";
import * as TestClient from "./TestClient";

describe("Client", () => {
  it.effect("preserves authentication callback requirements", () =>
    Effect.gen(function* () {
      class Token extends Context.Service<Token, string>()(
        "@confect/foldkit/test/Client.test/Token",
      ) {}
      class Observer extends Context.Service<
        Observer,
        (authenticated: boolean) => void
      >()("@confect/foldkit/test/Client.test/Observer") {}
      const testClient = yield* TestClient.TestClient;
      const client = yield* Client.make(testClient);
      const both = client.setAuth(
        () => Token,
        (authenticated) =>
          Effect.flatMap(Observer, (notify) =>
            Effect.sync(() => notify(authenticated)),
          ),
      );
      expectTypeOf(both).toEqualTypeOf<
        Effect.Effect<void, never, Token | Observer>
      >();
      expectTypeOf(client.setAuth(() => Token)).toEqualTypeOf<
        Effect.Effect<void, never, Token>
      >();
      expectTypeOf(client.setAuth(() => Effect.succeed(null))).toEqualTypeOf<
        Effect.Effect<void>
      >();
    }).pipe(Effect.provide(TestClient.layer)),
  );

  it.effect("allocates pagination ids within one client lifetime", () =>
    Effect.gen(function* () {
      const testClient = yield* TestClient.TestClient;
      const client = yield* Client.make(testClient);

      expect(yield* client.resolvePaginationId(Option.none())).toBe(1);
      expect(yield* client.resolvePaginationId(Option.none())).toBe(2);
      expect(yield* client.resolvePaginationId(Option.none())).toBe(3);
    }).pipe(Effect.provide(TestClient.layer)),
  );

  it.effect("isolates the allocator between client instances", () =>
    Effect.gen(function* () {
      const testClient = yield* TestClient.TestClient;
      const first = yield* Client.make(testClient);
      const second = yield* Client.make(testClient);

      expect(yield* first.resolvePaginationId(Option.none())).toBe(1);
      expect(yield* second.resolvePaginationId(Option.none())).toBe(1);
    }).pipe(Effect.provide(TestClient.layer)),
  );

  it.effect("reserves restored pagination ids before allocating new ones", () =>
    Effect.gen(function* () {
      const testClient = yield* TestClient.TestClient;
      const client = yield* Client.make(testClient);

      expect(yield* client.resolvePaginationId(Option.some(42))).toBe(42);
      expect(yield* client.resolvePaginationId(Option.none())).toBe(43);
      expect(yield* client.resolvePaginationId(Option.some(7))).toBe(7);
      expect(yield* client.resolvePaginationId(Option.none())).toBe(44);
    }).pipe(Effect.provide(TestClient.layer)),
  );
});
