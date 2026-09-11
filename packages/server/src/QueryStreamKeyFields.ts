import * as Array from "effect/Array";
import { identity } from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export const QueryStreamKeyFields = Schema.Array(Schema.String);

export type QueryStreamKeyFields = typeof QueryStreamKeyFields.Type;

export const Equivalence = Schema.toEquivalence(QueryStreamKeyFields);

export type Head<Fields extends QueryStreamKeyFields> =
  Fields extends readonly [infer H extends string, ...QueryStreamKeyFields]
    ? H
    : never;

export type Tail<Fields extends QueryStreamKeyFields> =
  Fields extends readonly [string, ...infer Rest extends QueryStreamKeyFields]
    ? Rest
    : QueryStreamKeyFields;

export interface WithTiebreakers {
  readonly keyFields: QueryStreamKeyFields;
  readonly tiebreakers: ReadonlyArray<number>;
}

/**
 * Append the implicit `_id` tiebreaker unless the field list already ends
 * with it—the single runtime convention for order-key and index-key
 * field lists.
 */
export const withIdTiebreaker = (
  fields: QueryStreamKeyFields,
): QueryStreamKeyFields =>
  Option.exists(Array.last(fields), (field) => field === "_id")
    ? fields
    : Array.append(fields, "_id");

/**
 * The position of the `_id` tiebreaker that {@link withIdTiebreaker} added
 * to `fields` (none when the fields already ended with `_id`, as `by_id`'s
 * do—that `_id` is part of the type-level key).
 */
export const appendedTiebreaker = (
  fields: QueryStreamKeyFields,
  withTiebreaker: QueryStreamKeyFields,
): ReadonlyArray<number> =>
  withTiebreaker.length === fields.length ? [] : [withTiebreaker.length - 1];

/** The order-key fields the type-level key names: all but the tiebreakers. */
export const visibleKeyFields = (self: WithTiebreakers): QueryStreamKeyFields =>
  Array.filter(
    self.keyFields,
    (_field, index) => !Array.contains(self.tiebreakers, index),
  );

/**
 * The runtime length of the order-key prefix that covers the first
 * `visibleLength` type-visible fields—including any tiebreakers that
 * sit between them.
 */
export const runtimePrefixLength = (
  self: WithTiebreakers,
  visibleLength: number,
): number =>
  visibleLength === 0
    ? 0
    : Option.getOrThrowWith(
        Array.get(
          Array.filter(
            Array.makeBy(self.keyFields.length, identity),
            (index) => !Array.contains(self.tiebreakers, index),
          ),
          visibleLength - 1,
        ),
        () =>
          new Error(
            `QueryStream: prefix length ${visibleLength} exceeds the order key ([${Array.join(self.keyFields, ", ")}])`,
          ),
      ) + 1;

export const rename = (
  self: WithTiebreakers,
  key: QueryStreamKeyFields,
): QueryStreamKeyFields => {
  const visible = visibleKeyFields(self);
  if (key.length !== visible.length) {
    throw new Error(
      `QueryStream.renameKey: key ([${Array.join(key, ", ")}]) must have as many fields as the stream's order key ([${Array.join(visible, ", ")}])`,
    );
  }
  return Array.map(self.keyFields, (field, index) =>
    Array.contains(self.tiebreakers, index)
      ? field
      : Option.getOrThrowWith(
          Array.get(
            key,
            index -
              Array.filter(self.tiebreakers, (position) => position < index)
                .length,
          ),
          () =>
            new Error("QueryStream.renameKey: key/order-key length mismatch"),
        ),
  );
};
