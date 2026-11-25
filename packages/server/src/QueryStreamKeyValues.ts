import { convexToJson, jsonToConvex, compareValues } from "convex/values";
import type { Value } from "convex/values";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Order_ from "effect/Order";
import type * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaIssue from "effect/SchemaIssue";
import type * as QueryStreamOrderDirection from "./QueryStreamOrderDirection";

const UNDEFINED_SENTINEL = { $undefined: true } as const;
const KeyValue = Schema.Json.pipe(
  Schema.decodeTo(
    Schema.declare<Value | undefined>(
      (value): value is Value | undefined =>
        value === undefined ||
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The SDK encoder is the validator here; checking nested values first would traverse the same cursor key twice.
        Result.isSuccess(Result.try(() => convexToJson(value as Value))),
    ),
    {
      decode: SchemaGetter.transformEffect((value, options) =>
        Effect.try({
          try: () =>
            Result.match(
              Schema.decodeUnknownResult(
                Schema.Struct({ $undefined: Schema.Literal(true) }),
                { onExcessProperty: "error" },
              )(value),
              {
                onSuccess: () => undefined,
                onFailure: () =>
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The codec accepts readonly JSON; the SDK takes mutable JSON but only reads it, so no deep copy is needed.
                  jsonToConvex(value as Parameters<typeof jsonToConvex>[0]),
              },
            ),
          catch: () =>
            new SchemaIssue.InvalidValue(
              { message: "Invalid Convex key value" },
              value,
              options,
            ),
        }),
      ),
      encode: SchemaGetter.transform((value) =>
        value === undefined ? UNDEFINED_SENTINEL : convexToJson(value),
      ),
    },
  ),
);

/**
 * @experimental
 *
 * @internal
 */
export type KeyValue = typeof KeyValue.Type;

/**
 * @experimental
 *
 * @internal
 */
export const QueryStreamKeyValues = Schema.Array(KeyValue);

/**
 * @experimental
 *
 * @internal
 */
export type QueryStreamKeyValues = typeof QueryStreamKeyValues.Type;

/**
 * `Order` over Convex values, matching Convex's index ordering—a wrapper around
 * the canonical `compareValues` from `convex/values` (type rank first, then
 * within the type, including UTF-8 string order and NaN bit-level ordering).
 *
 * @experimental
 *
 * @internal
 */
export const ValueOrder: Order_.Order<KeyValue> = (self, that) => {
  const ordering = compareValues(self, that);
  return ordering < 0 ? -1 : ordering > 0 ? 1 : 0;
};

const AscendingOrder = Order_.Array(ValueOrder);
const DescendingOrder = Order_.flip(AscendingOrder);

/**
 * Compare key values in the requested direction. Ascending order is
 * lexicographic by `ValueOrder`, then by length, matching Convex array values;
 * descending order reverses it.
 *
 * @experimental
 *
 * @internal
 */
export const Order = (
  orderDirection: QueryStreamOrderDirection.QueryStreamOrderDirection,
): Order_.Order<QueryStreamKeyValues> =>
  orderDirection === "asc" ? AscendingOrder : DescendingOrder;

/**
 * @experimental
 *
 * @internal
 */
export const extract = (
  encoded: Record.ReadonlyRecord<string, unknown>,
  keyPaths: ReadonlyArray<ReadonlyArray<string>>,
): QueryStreamKeyValues =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- These paths select index values from a stored Convex row; validating nested values again would scan each selected subtree.
  Array.map(keyPaths, (path) =>
    Array.reduce(
      path,
      encoded as unknown,
      (value, segment) =>
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- extract accepts unknown-valued records; optional indexing preserves missing paths and indexed properties of scalar values.
        (value as Record.ReadonlyRecord<string, unknown> | undefined)?.[
          segment
        ],
    ),
  ) as QueryStreamKeyValues;
