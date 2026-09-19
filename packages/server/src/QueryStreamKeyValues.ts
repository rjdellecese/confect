import {
  convexToJson,
  jsonToConvex,
  compareValues,
  type Value,
} from "convex/values";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Order_ from "effect/Order";
import type * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaIssue from "effect/SchemaIssue";
import type { QueryStreamOrderDirection as OrderDirection } from "./QueryStreamOrderDirection";

const UNDEFINED_SENTINEL = { $undefined: true } as const;
const KeyValue = Schema.declare<Value | undefined>(
  (value): value is Value | undefined =>
    value === undefined ||
    Result.isSuccess(Result.try(() => convexToJson(value as Value))),
  {
    toCodecJson: () =>
      Schema.link<Value | undefined>()(Schema.Json, {
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
      }),
  },
);

/**
 * @experimental
 */
export type KeyValue = typeof KeyValue.Type;

/**
 * @experimental
 */
export const QueryStreamKeyValues = Schema.Array(KeyValue);

/**
 * @experimental
 */
export type QueryStreamKeyValues = typeof QueryStreamKeyValues.Type;

/**
 * `Order` over Convex values, matching Convex's index ordering—a wrapper around
 * the canonical `compareValues` from `convex/values` (type rank first, then
 * within the type, including UTF-8 string order and NaN bit-level ordering).
 *
 * @experimental
 */
export const ValueOrder: Order_.Order<KeyValue> = Order_.make(
  (self, that) => Math.sign(compareValues(self, that)) as -1 | 0 | 1,
);

const AscendingOrder = Order_.Array(ValueOrder);
const DescendingOrder = Order_.flip(AscendingOrder);

/**
 * Compare key values in the requested direction. Ascending order is
 * lexicographic by `ValueOrder`, then by length, matching Convex array values;
 * descending order reverses it.
 *
 * @experimental
 */
export const Order = (
  orderDirection: OrderDirection,
): Order_.Order<QueryStreamKeyValues> =>
  orderDirection === "asc" ? AscendingOrder : DescendingOrder;

/**
 * @experimental
 */
export const extract = (
  encoded: Record.ReadonlyRecord<string, unknown>,
  keyPaths: ReadonlyArray<ReadonlyArray<string>>,
): QueryStreamKeyValues =>
  Array.map(keyPaths, (path) =>
    Array.reduce(
      path,
      encoded as unknown,
      (value, segment) =>
        (value as Record.ReadonlyRecord<string, unknown> | undefined)?.[
          segment
        ],
    ),
  ) as QueryStreamKeyValues;
