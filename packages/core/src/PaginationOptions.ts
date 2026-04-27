import { Schema } from "effect";

/**
 * The options accepted by `OrderedQuery.paginate` and required by
 * `usePaginatedQuery` from `@confect/react`.
 *
 * Mirrors Convex's [`PaginationOptions`](https://docs.convex.dev/api/interfaces/server.PaginationOptions).
 *
 * Define a paginated query spec by including this schema in your `args`:
 *
 * ```ts
 * import { FunctionSpec, PaginationOptions, PaginationResult } from "@confect/core";
 * import { Schema } from "effect";
 *
 * FunctionSpec.publicQuery({
 *   name: "list",
 *   args: Schema.Struct({ paginationOpts: PaginationOptions.PaginationOptions }),
 *   returns: PaginationResult.PaginationResult(Notes.Doc),
 * });
 * ```
 */
export const PaginationOptions = Schema.Struct({
  numItems: Schema.Number,
  cursor: Schema.Union(Schema.String, Schema.Null),
  endCursor: Schema.optionalWith(Schema.Union(Schema.String, Schema.Null), {
    exact: true,
  }),
  id: Schema.optionalWith(Schema.Number, { exact: true }),
  maximumRowsRead: Schema.optionalWith(Schema.Number, { exact: true }),
  maximumBytesRead: Schema.optionalWith(Schema.Number, { exact: true }),
});
