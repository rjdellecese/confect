import { RequestMetadata as BarrelRequestMetadata } from "@confect/server";
import * as RequestMetadata from "@confect/server/RequestMetadata";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type {
  MutationMeta,
  RequestMetadata as NativeRequestMetadata,
} from "convex/server";
import * as Effect from "effect/Effect";
import { vi } from "vitest";

describe("RequestMetadata", () => {
  it("exports the same service through the barrel and leaf module", () => {
    expect(BarrelRequestMetadata.RequestMetadata).toBe(
      RequestMetadata.RequestMetadata,
    );
    expectTypeOf<RequestMetadata.Metadata>().toEqualTypeOf<NativeRequestMetadata>();
  });

  it.effect(
    "reads native payloads lazily and freshly with the original receiver",
    () => {
      const first: NativeRequestMetadata = {
        ip: null,
        userAgent: null,
        requestId: "scheduled-request",
        scheduledFunctionId: "scheduled-function",
        authToken: null,
      };
      const second: NativeRequestMetadata = {
        ip: "192.0.2.1",
        userAgent: "test-client",
        requestId: "http-request",
        scheduledFunctionId: null,
        authToken: null,
      };
      const getRequestMetadata = vi
        .fn<MutationMeta["getRequestMetadata"]>()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second);
      const meta = { getRequestMetadata } satisfies Pick<
        MutationMeta,
        "getRequestMetadata"
      >;
      const layer = RequestMetadata.layer(meta);

      expect(getRequestMetadata).not.toHaveBeenCalled();

      return Effect.gen(function* () {
        const metadata = yield* RequestMetadata.RequestMetadata;
        const get = metadata.get();

        expectTypeOf(get).toEqualTypeOf<Effect.Effect<NativeRequestMetadata>>();
        expect(getRequestMetadata).not.toHaveBeenCalled();
        expect(yield* get).toBe(first);
        expect(yield* get).toBe(second);
        expect(getRequestMetadata).toHaveBeenCalledTimes(2);
        expect(getRequestMetadata.mock.contexts[0]).toBe(meta);
        expect(getRequestMetadata.mock.contexts[1]).toBe(meta);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect("preserves rejected native promises as defects", () => {
    const failure = new Error("Request metadata unavailable");
    const meta = {
      getRequestMetadata: () => Promise.reject(failure),
    } satisfies Pick<MutationMeta, "getRequestMetadata">;

    return Effect.gen(function* () {
      const metadata = yield* RequestMetadata.RequestMetadata;
      expect(
        yield* metadata.get().pipe(Effect.catchDefect(Effect.succeed)),
      ).toBe(failure);
    }).pipe(Effect.provide(RequestMetadata.layer(meta)));
  });
});
