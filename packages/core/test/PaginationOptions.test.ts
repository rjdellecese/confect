import type { PaginationOptions as ConvexPaginationOptions } from "convex/server";
import { expectTypeOf, test } from "vitest";
import type * as PaginationOptions from "../src/PaginationOptions";

test("PaginationOptions's encoded type extends Convex type", () => {
  type EncodedPaginationOptions =
    (typeof PaginationOptions.PaginationOptions)["Encoded"];

  expectTypeOf<EncodedPaginationOptions>().toExtend<ConvexPaginationOptions>();
});

test("PaginationOptions's decoded type extends Convex type", () => {
  type DecodedPaginationOptions =
    (typeof PaginationOptions.PaginationOptions)["Type"];

  expectTypeOf<DecodedPaginationOptions>().toExtend<ConvexPaginationOptions>();
});
