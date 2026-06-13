import { Ref } from "@confect/core";
import type { OptimisticLocalStore as ConvexOptimisticLocalStore } from "convex/browser";
import * as Option from "effect/Option";

/**
 * The Confect counterpart to Convex's `OptimisticLocalStore`.
 *
 * Its methods accept Confect query `Ref`s and operate on decoded (Effect
 * Schema) values rather than the encoded values stored by Convex. Query values
 * are wrapped in `Option`: `Option.none()` represents a query that is not
 * present in the store, and `Option.some(value)` carries the decoded value.
 */
export interface OptimisticLocalStore {
  getQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    ...args: Ref.OptionalArgs<Query>
  ): Option.Option<Ref.Returns<Query>>;

  getAllQueries<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
  ): Array<{
    args: Ref.Args<Query>;
    value: Option.Option<Ref.Returns<Query>>;
  }>;

  setQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    args: Ref.Args<Query>,
    value: Option.Option<Ref.Returns<Query>>,
  ): void;
}

/**
 * Wraps Convex's `OptimisticLocalStore` so that it accepts Confect query `Ref`s
 * and decoded values, handling the encoding/decoding against Convex's store.
 */
export const make = (
  convexLocalStore: ConvexOptimisticLocalStore,
): OptimisticLocalStore => ({
  getQuery: (queryRef, ...rest) => {
    const functionReference = Ref.getFunctionReference(queryRef);
    const args = (rest[0] ?? {}) as Ref.Args<typeof queryRef>;
    const encodedArgs = Ref.encodeArgsSync(queryRef, args);
    const encoded = convexLocalStore.getQuery(functionReference, encodedArgs);
    return encoded === undefined
      ? Option.none()
      : Option.some(Ref.decodeReturnsSync(queryRef, encoded));
  },
  getAllQueries: (queryRef) => {
    const functionReference = Ref.getFunctionReference(queryRef);
    return convexLocalStore
      .getAllQueries(functionReference)
      .map(({ args, value }) => ({
        args: Ref.decodeArgsSync(queryRef, args),
        value:
          value === undefined
            ? Option.none()
            : Option.some(Ref.decodeReturnsSync(queryRef, value)),
      }));
  },
  setQuery: (queryRef, args, value) => {
    const functionReference = Ref.getFunctionReference(queryRef);
    const encodedArgs = Ref.encodeArgsSync(queryRef, args);
    const encodedValue = Option.match(value, {
      onNone: () => undefined,
      onSome: (decoded) => Ref.encodeReturnsSync(queryRef, decoded),
    });
    convexLocalStore.setQuery(functionReference, encodedArgs, encodedValue);
  },
});
