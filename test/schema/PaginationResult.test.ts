import { Schema } from "@effect/schema";
import type { PaginationResult as ConvexPaginationResult } from "convex/server";
import { expectTypeOf, test } from "vitest";
import { PaginationResult } from "../../src/schemas/PaginationResult";

test("PaginationResult encoded schema matches Convex type", () => {
	const paginationResult = PaginationResult(Schema.String);
	type EncodedPaginationResult = Schema.Schema.Encoded<typeof paginationResult>;

	expectTypeOf<EncodedPaginationResult>().toEqualTypeOf<
		ConvexPaginationResult<string>
	>();
});
