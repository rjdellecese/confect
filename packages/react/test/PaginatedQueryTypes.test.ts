import { FunctionSpec, Ref } from "@confect/core";
import type { PaginatedQueryArgs, PaginatedQueryItem } from "@confect/react";
import {
  insertAtBottomIfLoaded,
  insertAtPosition,
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
} from "@confect/react";
import * as Leaf from "@confect/react/OptimisticLocalStore";
import type * as Shared from "@confect/react/PaginatedQueryTypes";
import { expect, expectTypeOf, test } from "@effect/vitest";
import * as Schema from "effect/Schema";

const query = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "list",
    args: () => ({
      count: Schema.FiniteFromString,
      label: Schema.optionalKey(Schema.String),
    }),
    item: () => Schema.Struct({ value: Schema.FiniteFromString }),
  }),
);
const noArgsQuery = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "all",
    item: () => Schema.Finite,
  }),
);

test("root aliases preserve the shared decoded types and optional modifiers", () => {
  expectTypeOf<PaginatedQueryArgs<typeof query>>().toEqualTypeOf<
    Shared.PaginatedQueryArgs<typeof query>
  >();
  expectTypeOf<PaginatedQueryItem<typeof query>>().toEqualTypeOf<
    Shared.PaginatedQueryItem<typeof query>
  >();
  expectTypeOf<PaginatedQueryArgs<typeof query>>().toEqualTypeOf<{
    readonly count: number;
    readonly label?: string;
  }>();
  expectTypeOf<PaginatedQueryItem<typeof query>>().toEqualTypeOf<{
    readonly value: number;
  }>();
  expectTypeOf<PaginatedQueryArgs<typeof noArgsQuery>>().toEqualTypeOf<
    Record<string, never>
  >();
});

test("root and leaf helper exports retain the same functions and generic signatures", () => {
  expectTypeOf(Leaf.insertAtTop<typeof query>).toEqualTypeOf<
    typeof insertAtTop<typeof query>
  >();
  expectTypeOf(Leaf.insertAtBottomIfLoaded<typeof query>).toEqualTypeOf<
    typeof insertAtBottomIfLoaded<typeof query>
  >();
  expectTypeOf(Leaf.insertAtPosition<typeof query>).toEqualTypeOf<
    typeof insertAtPosition<typeof query>
  >();
  expectTypeOf(
    Leaf.optimisticallyUpdateValueInPaginatedQuery<typeof query>,
  ).toEqualTypeOf<
    typeof optimisticallyUpdateValueInPaginatedQuery<typeof query>
  >();
  expect(Leaf.insertAtTop).toBe(insertAtTop);
  expect(Leaf.insertAtBottomIfLoaded).toBe(insertAtBottomIfLoaded);
  expect(Leaf.insertAtPosition).toBe(insertAtPosition);
  expect(Leaf.optimisticallyUpdateValueInPaginatedQuery).toBe(
    optimisticallyUpdateValueInPaginatedQuery,
  );
});
