import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Client from "@confect/foldkit/Client";

describe("Client", () => {
  it.effect("allocates pagination ids within one client lifetime", () =>
    Effect.gen(function* () {
      const client = yield* Client.make({} as any);

      expect(yield* client.nextPaginationId).toBe(1);
      expect(yield* client.nextPaginationId).toBe(2);
      expect(yield* client.nextPaginationId).toBe(3);
    }),
  );

  it.effect("isolates the allocator between client instances", () =>
    Effect.gen(function* () {
      const first = yield* Client.make({} as any);
      const second = yield* Client.make({} as any);

      expect(yield* first.nextPaginationId).toBe(1);
      expect(yield* second.nextPaginationId).toBe(1);
    }),
  );
});
