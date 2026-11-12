import { expect, expectTypeOf, it } from "@effect/vitest";
import * as OrderedQuery from "@confect/server/OrderedQuery";
import * as QueryInitializer from "@confect/server/QueryInitializer";
import * as Table from "@confect/server/Table";
import type * as TableInfo from "@confect/server/TableInfo";
import type { BaseDatabaseReader } from "@confect/core/Types";
import type {
  Expression,
  OrderedQuery as ConvexOrderedQuery,
} from "convex/server";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

it("keeps native query creation, predicates, and schemas lazy", () => {
  const fields = vi.fn(() => Schema.Struct({ value: Schema.FiniteFromString }));
  const table = Table.make(fields)("entries");
  type Info = TableInfo.TableInfo<typeof table>;
  const factory =
    vi.fn<() => ConvexOrderedQuery<TableInfo.ConvexTableInfo<Info>>>();
  const predicate = vi.fn(() => true);
  const base = OrderedQuery.make(factory, table);
  const filtered = base.filter(predicate);
  expect(filtered).not.toBe(base);
  const terminals = [
    filtered.first(),
    filtered.take(1),
    filtered.collect(),
    filtered.stream(),
    filtered.paginate({ numItems: 1, cursor: null }),
  ];
  expect(terminals).toHaveLength(5);
  expect(factory).not.toHaveBeenCalled();
  expect(predicate).not.toHaveBeenCalled();
  expect(fields).not.toHaveBeenCalled();

  filtered.filter((q) => {
    expectTypeOf(q.field("value")).toEqualTypeOf<Expression<string>>();
    // @ts-expect-error Native expressions use stored strings, not decoded numbers.
    q.eq(q.field("value"), 2);
    // @ts-expect-error Unknown fields cannot be filtered.
    q.field("missing");
    return q.eq(q.field("value"), "2");
  });
  expectTypeOf(filtered).toEqualTypeOf<OrderedQuery.OrderedQuery<Info>>();
  const preserveNamedDoc = (
    query: OrderedQuery.OrderedQuery<Info, { readonly named: true }>,
  ) => query.filter(() => true);
  expectTypeOf<ReturnType<typeof preserveNamedDoc>>().toEqualTypeOf<
    OrderedQuery.OrderedQuery<Info, { readonly named: true }>
  >();

  const query =
    vi.fn<
      BaseDatabaseReader<{ entries: TableInfo.ConvexTableInfo<Info> }>["query"]
    >();
  const get =
    vi.fn<
      BaseDatabaseReader<{ entries: TableInfo.ConvexTableInfo<Info> }>["get"]
    >();
  QueryInitializer.make({ query, get }, table)
    .index("by_creation_time")
    .filter(predicate);
  expect(query).not.toHaveBeenCalled();
  expect(fields).not.toHaveBeenCalled();
});
