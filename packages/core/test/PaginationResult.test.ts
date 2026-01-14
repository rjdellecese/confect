import { Schema } from "effect";
import { expectTypeOf, test } from "vitest";
import { PaginationResult } from "../src/PaginationResult";

test("PaginationResult encoded schema matches Convex type", () => {
  const _paginationResult = PaginationResult(Schema.String);
  type EncodedPaginationResult = Schema.Schema.Encoded<
    typeof _paginationResult
  >;

  expectTypeOf<EncodedPaginationResult>().toExtend<EncodedPaginationResult>();
});
