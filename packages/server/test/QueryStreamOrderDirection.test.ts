import * as QueryStreamOrderDirection from "@confect/server/QueryStreamOrderDirection";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";

describe("QueryStreamOrderDirection", () => {
  it("flips literal directions and preserves their types", () => {
    const descending = QueryStreamOrderDirection.flip("asc");
    const ascending = QueryStreamOrderDirection.flip("desc");
    expect(descending).toBe("desc");
    expect(ascending).toBe("asc");
    expectTypeOf(descending).toEqualTypeOf<"desc">();
    expectTypeOf(ascending).toEqualTypeOf<"asc">();
    expectTypeOf<
      QueryStreamOrderDirection.Flip<QueryStreamOrderDirection.QueryStreamOrderDirection>
    >().toEqualTypeOf<"asc" | "desc">();
  });
});
