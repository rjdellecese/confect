import { FunctionSpec, Ref } from "@confect/core";
import { assert, describe, expect, expectTypeOf, test } from "@effect/vitest";
import {
  OptimisticLocalStore,
  insertAtBottomIfLoaded,
  insertAtPosition,
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
} from "@confect/react";
import type { PaginatedQueryArgs, PaginatedQueryItem } from "@confect/react";
import { getFunctionName } from "convex/server";
import type {
  PaginationOptions,
  PaginationResult,
  RegisteredQuery,
} from "convex/server";
import type { OptimisticLocalStore as NativeStore } from "convex/browser";
import { insertAtPosition as nativeInsertAtPosition } from "convex/react";
import { compareValues, type Value } from "convex/values";
import * as Array from "effect/Array";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

const query = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "list",
    args: () => ({
      channel: Schema.FiniteFromString,
      filter: Schema.Struct({ archived: Schema.Boolean }),
      label: Schema.optionalKey(Schema.String),
    }),
    item: () =>
      Schema.Struct({
        rank: Schema.FiniteFromString,
        at: Schema.DateFromString,
      }),
  }),
);
const noArgsQuery = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "all",
    item: () => Schema.Finite,
  }),
);
const plainQuery = Ref.make(
  "notes",
  FunctionSpec.publicQuery({ name: "count", returns: () => Schema.Finite }),
);
const args = { channel: 1, filter: { archived: false } };
const at = Result.getOrThrow(
  Schema.decodeResult(Schema.DateFromString)("2026-01-01T00:00:00.000Z"),
);
const makeItem = (rank: number) => ({ rank, at });

type Entry = {
  name: string;
  args: Record<string, Value>;
  value: Value | undefined;
};

const makeEntry = (
  ranks: number[] | undefined,
  cursor: string | null = null,
  isDone = false,
  id = 1,
  channel = "1",
): Entry => ({
  name: "notes:list",
  args: {
    channel,
    filter: { archived: false },
    paginationOpts: { cursor, numItems: 2, id },
  },
  value:
    ranks === undefined
      ? undefined
      : {
          page: Array.map(ranks, (rank) => ({
            rank: String(rank),
            at: at.toISOString(),
          })),
          continueCursor: cursor === null ? "next" : "end",
          isDone,
          splitCursor: "split",
          pageStatus: "SplitRecommended",
        },
});

const harness = (entries: Entry[]) => {
  const wire = {
    getAllQueries: vi
      .fn<NativeStore["getAllQueries"]>()
      .mockImplementation(
        (ref) =>
          Array.filter(
            entries,
            (entry) => entry.name === getFunctionName(ref),
          ) as ReturnType<NativeStore["getAllQueries"]>,
      ),
    getQuery: vi.fn(),
    setQuery: vi.fn(),
  };
  return { store: OptimisticLocalStore.make(wire), wire };
};

const writtenRanks = (wire: ReturnType<typeof harness>["wire"]) =>
  Array.map(wire.setQuery.mock.calls, ([, , value]) =>
    Array.map(
      Result.getOrThrow(
        Schema.decodeUnknownResult(
          Schema.Struct({
            page: Schema.Array(
              Schema.Struct({ rank: Schema.FiniteFromString }),
            ),
          }),
        )(value),
      ).page,
      (item) => item.rank,
    ),
  );

describe("optimisticallyUpdateValueInPaginatedQuery", () => {
  test("matches omitted and explicitly undefined optional fields on the wire for all helpers", () => {
    const optionalQuery = Ref.make(
      "optional",
      FunctionSpec.publicPaginatedQuery({
        name: "list",
        args: () => ({
          label: Schema.optional(Schema.String),
          filter: Schema.Struct({ label: Schema.optional(Schema.String) }),
        }),
        item: () => Schema.Finite,
      }),
    );
    const entries: Entry[] = [
      {
        name: "optional:list",
        args: { filter: {}, paginationOpts: { cursor: null, numItems: 2 } },
        value: { page: [1, 3], isDone: true, continueCursor: "end" },
      },
    ];
    const { store, wire } = harness(entries);
    const matchingArgs = { label: undefined, filter: { label: undefined } };
    optimisticallyUpdateValueInPaginatedQuery(
      store,
      optionalQuery,
      matchingArgs,
      (item) => item + 1,
    );
    const options = {
      paginatedQuery: optionalQuery,
      localQueryStore: store,
      argsToMatch: matchingArgs,
      item: 2,
    };
    insertAtTop(options);
    insertAtBottomIfLoaded(options);
    insertAtPosition({
      ...options,
      sortOrder: "asc",
      sortKeyFromItem: (item) => item,
    });
    expect(
      Array.map(wire.setQuery.mock.calls, ([, , value]) => value.page),
    ).toEqual([
      [2, 4],
      [2, 1, 3],
      [1, 3, 2],
      [1, 2, 3],
    ]);
    expect(entries[0]?.args).toEqual({
      filter: {},
      paginationOpts: { cursor: null, numItems: 2 },
    });
    expect(matchingArgs).toEqual({
      label: undefined,
      filter: { label: undefined },
    });
  });

  test("supports native-backed Confect refs without schema transformations", () => {
    const nativeQuery = Ref.make(
      "native",
      FunctionSpec.convexPublicQuery<
        RegisteredQuery<
          "public",
          { paginationOpts: PaginationOptions },
          PaginationResult<number>
        >
      >()("list"),
    );
    const { store, wire } = harness([
      {
        name: "native:list",
        args: { paginationOpts: { cursor: null, numItems: 2 } },
        value: { page: [1, 3], isDone: true, continueCursor: "end" },
      },
    ]);
    optimisticallyUpdateValueInPaginatedQuery(
      store,
      nativeQuery,
      {},
      (item) => {
        expectTypeOf(item).toEqualTypeOf<number>();
        return item + 1;
      },
    );
    insertAtTop({
      paginatedQuery: nativeQuery,
      localQueryStore: store,
      item: 0,
    });
    insertAtBottomIfLoaded({
      paginatedQuery: nativeQuery,
      localQueryStore: store,
      item: 4,
    });
    insertAtPosition({
      paginatedQuery: nativeQuery,
      localQueryStore: store,
      item: 2,
      sortOrder: "asc",
      sortKeyFromItem: (item) => item,
    });
    expect(
      Array.map(wire.setQuery.mock.calls, ([, , value]) => value.page),
    ).toEqual([
      [2, 4],
      [0, 1, 3],
      [1, 3, 4],
      [1, 2, 3],
    ]);
  });

  test("updates every matching loaded page with decoded values and preserves inputs and metadata", () => {
    const entries = [
      makeEntry([1, 2]),
      makeEntry([3], "next", true),
      makeEntry(undefined, "loading"),
      makeEntry([9], null, true, 2, "2"),
      { ...makeEntry([8]), name: "other:list" },
    ];
    const before = structuredClone(entries);
    const { store, wire } = harness(entries);
    const update = vi.fn((value: PaginatedQueryItem<typeof query>) => ({
      ...value,
      rank: value.rank + 10,
    }));
    expect(
      optimisticallyUpdateValueInPaginatedQuery(store, query, args, update),
    ).toBeUndefined();
    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls[0]?.[0]).toEqual(makeItem(1));
    expect(writtenRanks(wire)).toEqual([[11, 12], [13]]);
    expect(wire.setQuery).toHaveBeenCalledWith(
      Ref.getFunctionReference(query),
      entries[0]?.args,
      {
        ...(entries[0]?.value as object),
        page: [
          { rank: "11", at: at.toISOString() },
          { rank: "12", at: at.toISOString() },
        ],
      },
    );
    expect(entries).toEqual(before);
    expect(args).toEqual({ channel: 1, filter: { archived: false } });
  });

  test("requires all user arguments to match, including optional fields", () => {
    const { store, wire } = harness([
      { ...makeEntry([1]), args: { ...makeEntry([1]).args, label: "tag" } },
    ]);
    optimisticallyUpdateValueInPaginatedQuery(
      store,
      query,
      args,
      (item) => item,
    );
    expect(wire.setQuery).not.toHaveBeenCalled();
    optimisticallyUpdateValueInPaginatedQuery(
      store,
      query,
      { ...args, label: "tag" },
      (item) => item,
    );
    expect(wire.setQuery).toHaveBeenCalledOnce();
  });
});

describe("boundary insertion", () => {
  test.each([insertAtTop, insertAtBottomIfLoaded])(
    "matches partial decoded object arguments and writes encoded results",
    (insert) => {
      const entries = [
        makeEntry([8], null, true, 1, "2"),
        makeEntry([1, 2], null, true),
        makeEntry([4], null, true, 3),
      ];
      const before = structuredClone(entries);
      const { store, wire } = harness(entries);
      const inserted = makeItem(3);
      insert({
        paginatedQuery: query,
        localQueryStore: store,
        argsToMatch: { channel: 1, filter: { archived: false } },
        item: inserted,
      });
      expect(writtenRanks(wire)).toEqual(
        insert === insertAtTop ? [[3, 1, 2]] : [[1, 2, 3]],
      );
      expect(wire.setQuery.mock.calls[0]?.[1]).toEqual(entries[1]?.args);
      expect(entries).toEqual(before);
      expect(inserted).toEqual(makeItem(3));
    },
  );

  test("top does not insert when the first matching initial page is absent or loading", () => {
    for (const entries of [
      [],
      [makeEntry([2], "next")],
      [makeEntry(undefined), makeEntry([3], null, true, 2)],
    ]) {
      const { store, wire } = harness(entries);
      insertAtTop({
        paginatedQuery: query,
        localQueryStore: store,
        item: makeItem(0),
      });
      expect(wire.setQuery).not.toHaveBeenCalled();
    }
  });

  test("bottom requires a completed loaded page, not merely the last loaded page", () => {
    for (const entries of [
      [],
      [makeEntry([1]), makeEntry([2], "next"), makeEntry(undefined, "end")],
    ]) {
      const { store, wire } = harness(entries);
      insertAtBottomIfLoaded({
        paginatedQuery: query,
        localQueryStore: store,
        item: makeItem(3),
      });
      expect(wire.setQuery).not.toHaveBeenCalled();
    }
    const { store, wire } = harness([
      makeEntry([1]),
      makeEntry([], "next", true),
    ]);
    insertAtBottomIfLoaded({
      paginatedQuery: query,
      localQueryStore: store,
      item: makeItem(3),
    });
    expect(writtenRanks(wire)).toEqual([[3]]);
  });

  test("top can populate an empty initial page without requiring an exhausted query", () => {
    const { store, wire } = harness([makeEntry([])]);
    insertAtTop({
      paginatedQuery: query,
      localQueryStore: store,
      argsToMatch: {},
      item: makeItem(1),
    });
    expect(writtenRanks(wire)).toEqual([[1]]);
  });
});

describe("insertAtPosition", () => {
  test("groups Convex bigint arguments without JSON loss and keeps different lists separate", () => {
    const bigintQuery = Ref.make(
      "bigints",
      FunctionSpec.publicPaginatedQuery({
        name: "list",
        args: () => ({ key: Schema.BigInt }),
        item: () => Schema.Finite,
      }),
    );
    const { store, wire } = harness(
      Array.map([1n, 2n], (key) => ({
        name: "bigints:list",
        args: { key, paginationOpts: { cursor: null, numItems: 2, id: 1 } },
        value: { page: [1, 3], isDone: true, continueCursor: "end" },
      })),
    );
    insertAtPosition({
      paginatedQuery: bigintQuery,
      localQueryStore: store,
      item: 2,
      sortOrder: "asc",
      sortKeyFromItem: (item) => item,
    });
    expect(wire.setQuery).toHaveBeenCalledTimes(2);
    expect(wire.setQuery.mock.calls[0]?.[1].key).toBe(1n);
    expect(wire.setQuery.mock.calls[1]?.[1].key).toBe(2n);
    expect(wire.setQuery.mock.calls[0]?.[2].page).toEqual([1, 2, 3]);
  });

  test.each([
    {
      order: "asc" as const,
      pages: [
        [1, 3],
        [5, 7],
      ],
      rank: 4,
      expected: [1, 3, 4],
    },
    {
      order: "desc" as const,
      pages: [
        [7, 5],
        [3, 1],
      ],
      rank: 4,
      expected: [7, 5, 4],
    },
    {
      order: "asc" as const,
      pages: [
        [1, 3],
        [5, 7],
      ],
      rank: 6,
      expected: [5, 6, 7],
    },
    {
      order: "desc" as const,
      pages: [
        [7, 5],
        [3, 1],
      ],
      rank: 2,
      expected: [3, 2, 1],
    },
    {
      order: "asc" as const,
      pages: [
        [1, 3],
        [5, 7],
      ],
      rank: 3,
      expected: [1, 3, 3],
    },
  ])(
    "inserts at the native $order position across unordered cached pages",
    ({ order, pages, rank, expected }) => {
      const entries = [makeEntry(pages[1], "next", true), makeEntry(pages[0])];
      const before = structuredClone(entries);
      const { store, wire } = harness(entries);
      insertAtPosition({
        paginatedQuery: query,
        localQueryStore: store,
        item: makeItem(rank),
        sortOrder: order,
        sortKeyFromItem: (item) => [item.rank, item.at.getTime()],
      });
      expect(writtenRanks(wire)).toEqual([expected]);
      expect(entries).toEqual(before);
      const native = harness(entries);
      nativeInsertAtPosition({
        paginatedQuery: Ref.getFunctionReference(query),
        localQueryStore: native.wire,
        item: { rank: String(rank), at: at.toISOString() },
        sortOrder: order,
        sortKeyFromItem: (item) => [Number(item.rank), at.getTime()],
      });
      expect(wire.setQuery.mock.calls).toEqual(native.wire.setQuery.mock.calls);
    },
  );

  test.each([
    { entries: [] as Entry[], rank: 2, expected: [] },
    { entries: [makeEntry([], null, true)], rank: 2, expected: [] },
    { entries: [makeEntry(undefined)], rank: 2, expected: [] },
    { entries: [makeEntry([3], "next", true)], rank: 2, expected: [] },
    { entries: [makeEntry([1])], rank: 2, expected: [] },
    { entries: [makeEntry([3])], rank: 2, expected: [[2, 3]] },
    { entries: [makeEntry([1], "next", true)], rank: 2, expected: [[1, 2]] },
    { entries: [makeEntry([1], null, true)], rank: 1, expected: [[1, 1]] },
  ])(
    "honors empty, unloaded and end boundaries %#",
    ({ entries, rank, expected }) => {
      const { store, wire } = harness(entries);
      insertAtPosition({
        paginatedQuery: query,
        localQueryStore: store,
        item: makeItem(rank),
        sortOrder: "asc",
        sortKeyFromItem: (item) => item.rank,
      });
      expect(writtenRanks(wire)).toEqual(expected);
    },
  );

  test("isolates query arguments and pagination instance ids while matching decoded filters", () => {
    const entries = [
      makeEntry([1, 3]),
      makeEntry([5], "next", true),
      makeEntry([2, 6], null, true, 2),
      makeEntry([1, 9], null, true, 3, "2"),
    ];
    const { store, wire } = harness(entries);
    insertAtPosition({
      paginatedQuery: query,
      localQueryStore: store,
      argsToMatch: { filter: { archived: false }, channel: 1 },
      item: makeItem(4),
      sortOrder: "asc",
      sortKeyFromItem: (item) => item.rank,
    });
    expect(writtenRanks(wire)).toEqual([
      [1, 3, 4],
      [2, 4, 6],
    ]);
    expect(wire.setQuery.mock.calls[0]?.[1]).toEqual(entries[0]?.args);
    expect(wire.setQuery.mock.calls[1]?.[1]).toEqual(entries[2]?.args);
  });

  test("sorts Convex values, rather than JavaScript strings or tuple coercions", () => {
    const values: Value[] = [
      null,
      2n,
      2,
      "2",
      new Uint8Array([2]).buffer,
      [2],
      { a: 2 },
    ];
    for (const sortOrder of ["asc", "desc"] as const) {
      const sorted = sortOrder === "asc" ? values : Array.reverse(values);
      const valueQuery = Ref.make(
        "values",
        FunctionSpec.publicPaginatedQuery({
          name: "list",
          item: () => Schema.Struct({ key: Schema.Unknown }),
        }),
      );
      const nativeEntries = [
        {
          name: "values:list",
          args: { paginationOpts: { cursor: null, numItems: 10 } },
          value: {
            page: Array.map(sorted, (key) => ({ key })),
            isDone: true,
            continueCursor: "end",
          },
        },
      ];
      const { store, wire } = harness(nativeEntries);
      const key: Value = [1, 9];
      insertAtPosition({
        paginatedQuery: valueQuery,
        localQueryStore: store,
        item: { key },
        sortOrder,
        sortKeyFromItem: (item) => item.key as Value,
      });
      const output = wire.setQuery.mock.calls[0]?.[2].page as Array<{
        key: Value;
      }>;
      expect(output).toHaveLength(8);
      for (let i = 1; i < output.length; i++) {
        const before = output[i - 1];
        const after = output[i];
        assert(before !== undefined && after !== undefined);
        expect(
          compareValues(before.key, after.key) * (sortOrder === "asc" ? 1 : -1),
        ).toBeLessThanOrEqual(0);
      }
    }
  });
});

test("preserves generic refs, decoded return types, and optional argument modifiers", () => {
  const generic = <Query extends Ref.AnyPublicPaginatedQuery>(
    store: OptimisticLocalStore.OptimisticLocalStore,
    ref: Query,
    item: PaginatedQueryItem<Query>,
    argsToMatch: Partial<PaginatedQueryArgs<Query>>,
  ) =>
    insertAtTop({
      paginatedQuery: ref,
      localQueryStore: store,
      item,
      argsToMatch,
    });
  expectTypeOf(generic<typeof query>).returns.toEqualTypeOf<void>();
  const check = (store: OptimisticLocalStore.OptimisticLocalStore) => {
    const result = optimisticallyUpdateValueInPaginatedQuery(
      store,
      query,
      args,
      (item) => {
        expectTypeOf(item).toEqualTypeOf<{
          readonly rank: number;
          readonly at: Date;
        }>();
        return item;
      },
    );
    expectTypeOf(result).toEqualTypeOf<void>();
    expectTypeOf(
      insertAtTop({
        paginatedQuery: noArgsQuery,
        localQueryStore: store,
        argsToMatch: {},
        item: 1,
      }),
    ).toEqualTypeOf<void>();
    expectTypeOf(
      insertAtBottomIfLoaded({
        paginatedQuery: query,
        localQueryStore: store,
        argsToMatch: { label: "tag" },
        item: makeItem(1),
      }),
    ).toEqualTypeOf<void>();
    expectTypeOf(
      insertAtPosition({
        paginatedQuery: query,
        localQueryStore: store,
        item: makeItem(1),
        sortOrder: "asc",
        sortKeyFromItem: (item) => {
          expectTypeOf(item.rank).toEqualTypeOf<number>();
          return [item.rank, item.at.getTime()];
        },
      }),
    ).toEqualTypeOf<void>();
    insertAtTop({
      // @ts-expect-error Helpers require a paginated public query.
      paginatedQuery: plainQuery,
      localQueryStore: store,
      item: 1,
    });
    insertAtTop({
      paginatedQuery: query,
      localQueryStore: store,
      // @ts-expect-error Items use decoded fields.
      item: { rank: "1", at },
    });
    insertAtTop({
      paginatedQuery: query,
      localQueryStore: store,
      // @ts-expect-error Matching uses decoded arguments.
      argsToMatch: { channel: "1" },
      item: makeItem(1),
    });
    optimisticallyUpdateValueInPaginatedQuery(
      store,
      query,
      // @ts-expect-error Pagination protocol fields are not user arguments.
      { ...args, paginationOpts: { cursor: null, numItems: 1 } },
      (item) => item,
    );
  };
  expectTypeOf(check).toBeFunction();
  expectTypeOf<PaginatedQueryArgs<typeof query>["label"]>().toEqualTypeOf<
    string | undefined
  >();
  expect(OptimisticLocalStore.insertAtPosition).toBe(insertAtPosition);
});
