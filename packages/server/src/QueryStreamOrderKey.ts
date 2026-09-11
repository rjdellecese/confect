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
export const KeyValue = Schema.declare<Value | undefined>(
  (value): value is Value | undefined =>
    value === undefined ||
    Result.isSuccess(Result.try(() => convexToJson(value as Value))),
  {
    toCodecJson: () =>
      Schema.link<Value | undefined>()(Schema.Json, {
        decode: SchemaGetter.transformEffect((value, options) =>
          Effect.try({
            try: () =>
              Result.isSuccess(
                Schema.decodeUnknownResult(
                  Schema.Struct({ $undefined: Schema.Literal(true) }),
                  { onExcessProperty: "error" },
                )(value),
              )
                ? undefined
                : jsonToConvex(value as Parameters<typeof jsonToConvex>[0]),
            catch: () =>
              new SchemaIssue.InvalidValue(
                { message: "Invalid Convex order-key value" },
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

export type KeyValue = typeof KeyValue.Type;

export const QueryStreamOrderKey = Schema.Array(KeyValue);

export type QueryStreamOrderKey = typeof QueryStreamOrderKey.Type;

/**
 * `Order` over Convex values, matching Convex's index ordering—a wrapper
 * around the canonical `compareValues` from `convex/values` (type rank
 * first, then within the type, including UTF-8 string order and NaN
 * bit-level ordering).
 *
 * @experimental
 */
export const ValueOrder: Order_.Order<KeyValue> = Order_.make(
  (self, that) => Math.sign(compareValues(self, that)) as -1 | 0 | 1,
);

/**
 * `Order` over order keys: lexicographic by `ValueOrder`, then by length—also the ordering of Convex array values.
 *
 * @experimental
 */
export const Order: Order_.Order<QueryStreamOrderKey> =
  Order_.Array(ValueOrder);

/** Order of positions in stream order: for `desc`, later keys are smaller. */
export const positionOrder = (
  order: OrderDirection,
): Order_.Order<QueryStreamOrderKey> =>
  order === "asc" ? Order : Order_.flip(Order);

export const extract = (
  encoded: Record.ReadonlyRecord<string, unknown>,
  keyPaths: ReadonlyArray<ReadonlyArray<string>>,
): QueryStreamOrderKey =>
  Array.map(keyPaths, (path) =>
    Array.reduce(
      path,
      encoded as unknown,
      (value, segment) =>
        (value as Record.ReadonlyRecord<string, unknown> | undefined)?.[
          segment
        ],
    ),
  ) as QueryStreamOrderKey;
