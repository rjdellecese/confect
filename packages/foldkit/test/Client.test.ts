import { expect, expectTypeOf, layer } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Client from "@confect/foldkit/Client";
import * as TestClient from "./TestClient";

layer(TestClient.layer, { buildPerTest: true })("Client", (it) => {
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
    }),
  );

  it.effect("allocates pagination ids within one client lifetime", () =>
    Effect.gen(function* () {
      const testClient = yield* TestClient.TestClient;
      const client = yield* Client.make(testClient);

      const observed1 = yield* client.resolvePaginationId(Option.none());
      expect(observed1).toBe(1);
      const observed2 = yield* client.resolvePaginationId(Option.none());
      expect(observed2).toBe(2);
      const observed3 = yield* client.resolvePaginationId(Option.none());
      expect(observed3).toBe(3);
    }),
  );

  it.effect("isolates the allocator between client instances", () =>
    Effect.gen(function* () {
      const testClient = yield* TestClient.TestClient;
      const first = yield* Client.make(testClient);
      const second = yield* Client.make(testClient);

      const observed4 = yield* first.resolvePaginationId(Option.none());
      expect(observed4).toBe(1);
      const observed5 = yield* second.resolvePaginationId(Option.none());
      expect(observed5).toBe(1);
    }),
  );

  it.effect("reserves restored pagination ids before allocating new ones", () =>
    Effect.gen(function* () {
      const testClient = yield* TestClient.TestClient;
      const client = yield* Client.make(testClient);

      const observed6 = yield* client.resolvePaginationId(Option.some(42));
      expect(observed6).toBe(42);
      const observed7 = yield* client.resolvePaginationId(Option.none());
      expect(observed7).toBe(43);
      const observed8 = yield* client.resolvePaginationId(Option.some(7));
      expect(observed8).toBe(7);
      const observed9 = yield* client.resolvePaginationId(Option.none());
      expect(observed9).toBe(44);
    }),
  );
});
