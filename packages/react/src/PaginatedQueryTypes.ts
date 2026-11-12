import type * as Ref from "@confect/core/Ref";

/**
 * Like `Omit`, but implemented with key remapping so that optional modifiers
 * are preserved and index signatures don't reintroduce the omitted key's
 * literal type. Mirrors `BetterOmit` from `convex/server`.
 */
type OmitKey<T, K extends PropertyKey> = {
  [P in keyof T as P extends K ? never : P]: T[P];
};

/**
 * The args for a paginated query: the ref's args without `paginationOpts`,
 * which the underlying Convex hook manages itself. When no args remain,
 * resolves to `Record<string, never>` (only the empty object is accepted)
 * rather than `{}`, which would accept any non-nullish value.
 */
export type PaginatedQueryArgs<Query extends Ref.AnyPublicPaginatedQuery> =
  OmitKey<Ref.Args<Query>, "paginationOpts"> extends infer Args_
    ? keyof Args_ extends never
      ? Record<string, never>
      : Args_
    : never;

/**
 * The item type for a paginated query: the element type of the `page` field of
 * the ref's returns.
 */
export type PaginatedQueryItem<Query extends Ref.AnyPublicPaginatedQuery> =
  Ref.Returns<Query>["page"][number];
