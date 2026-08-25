import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Client from "@confect/foldkit/Client";

describe("Client", () => {
  it.effect("allocates pagination ids within one client lifetime", () =>
    Effect.gen(function* () {
      const client = yield* Client.make({} as any);

      expect(yield* client.resolvePaginationId(Option.none())).toBe(1);
      expect(yield* client.resolvePaginationId(Option.none())).toBe(2);
      expect(yield* client.resolvePaginationId(Option.none())).toBe(3);
    }),
  );

  it.effect("isolates the allocator between client instances", () =>
    Effect.gen(function* () {
      const first = yield* Client.make({} as any);
      const second = yield* Client.make({} as any);

      expect(yield* first.resolvePaginationId(Option.none())).toBe(1);
      expect(yield* second.resolvePaginationId(Option.none())).toBe(1);
    }),
  );

  it.effect("reserves restored pagination ids before allocating new ones", () =>
    Effect.gen(function* () {
      const client = yield* Client.make({} as any);

      expect(yield* client.resolvePaginationId(Option.some(42))).toBe(42);
      expect(yield* client.resolvePaginationId(Option.none())).toBe(43);
      expect(yield* client.resolvePaginationId(Option.some(7))).toBe(7);
      expect(yield* client.resolvePaginationId(Option.none())).toBe(44);
    }),
  );
});
