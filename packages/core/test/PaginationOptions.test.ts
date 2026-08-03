import type { PaginationOptions as ConvexPaginationOptions } from "convex/server";
import * as Schema from "effect/Schema";
import { expect, expectTypeOf, test } from "vitest";
import * as PaginationOptions from "@confect/core/PaginationOptions";

test("PaginationOptions' type extends Convex type", () => {
  type Type = (typeof PaginationOptions.PaginationOptions)["Type"];

  expectTypeOf<Type>().toExtend<ConvexPaginationOptions>();
});

test("decodes the payloads Convex's paginated client sends", () => {
  const decode = Schema.decodeUnknownSync(PaginationOptions.PaginationOptions);

  // `usePaginatedQuery` from `convex/react` always includes `id`.
  expect(decode({ numItems: 10, cursor: null, id: 1 })).toEqual({
    numItems: 10,
    cursor: null,
    id: 1,
  });

  // Page splits include `endCursor`; the budget fields are also protocol-legal.
  expect(
    decode({
      numItems: 10,
      cursor: "abc",
      endCursor: "def",
      id: 1,
      maximumRowsRead: 100,
      maximumBytesRead: 1000,
    }),
  ).toEqual({
    numItems: 10,
    cursor: "abc",
    endCursor: "def",
    id: 1,
    maximumRowsRead: 100,
    maximumBytesRead: 1000,
  });
});
