import { describe, it } from "@effect/vitest";
import { assertFalse, assertTrue } from "@effect/vitest/utils";
import { Effect } from "effect";
import * as Impl from "../src/Impl";

describe("Impl", () => {
  it.effect("isImpl returns true for Impl values", () =>
    Effect.sync(() => {
      const value = {
        [Impl.TypeId]: Impl.TypeId,
        api: {},
        finalizationStatus: "Unfinalized" as const,
      };
      assertTrue(Impl.isImpl(value));
    }),
  );

  it.effect("isImpl returns false for non-Impl values", () =>
    Effect.sync(() => {
      assertFalse(Impl.isImpl({}));
      assertFalse(Impl.isImpl(null));
      assertFalse(Impl.isImpl("string"));
      assertFalse(Impl.isImpl(42));
    }),
  );
});
