import * as Schema from "effect/Schema";

/**
 * Schema for the `paginationOpts` argument that every paginated query
 * receives. Mirrors `paginationOptsValidator` from `convex/server`.
 *
 * Use this as the `paginationOpts` field of a paginated query's args schema.
 * Beyond `numItems` and `cursor`, Convex's pagination protocol sends the
 * optional fields (`endCursor`, `id`, `maximumRowsRead`, `maximumBytesRead`)
 * with real requests — most notably `usePaginatedQuery` from `convex/react`
 * always includes `id`, and includes `endCursor` when splitting pages.
 * Declaring them is required for the generated Convex argument validator to
 * accept those requests and for the fields to survive decoding and reach
 * `paginate`.
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
