import type { PaginationResult as ConvexPaginationResult } from "convex/server";
import { Schema } from "effect";
import { expectTypeOf, test } from "vitest";
import * as PaginationResult from "../src/PaginationResult";

test("PaginationResult's encoded type extends Convex type", () => {
  const _paginationResult = PaginationResult.PaginationResult(Schema.String);
  type EncodedPaginationResult = (typeof _paginationResult)["Encoded"];

  expectTypeOf<EncodedPaginationResult>().toExtend<
    ConvexPaginationResult<string>
  >();
});
