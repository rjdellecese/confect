import * as Function from "effect/Function";
import * as EffectSchema from "effect/Schema";

/**
 * A query awaiting its first result for the current arguments.
 */
export interface Loading {
  readonly _tag: "Loading";
}

/**
 * The latest successful query result.
 */
export interface Success<A> {
  readonly _tag: "Success";
  readonly value: A;
}

/**
 * The latest query error, which does not imply the subscription has ended.
 */
export interface Failure<E> {
  readonly _tag: "Failure";
  readonly error: E;
}

/**
 * The current result of a reactive query in a Foldkit Model. Subscription
 * eligibility belongs to the Model's subscription dependencies, not this value.
 * Subsequent results replace the previous success or failure without entering a
 * refreshing state.
 */
export type QueryResult<A, E = never> = Loading | Success<A> | Failure<E>;

/**
 * Constructs a query awaiting its first result.
 */
export const load = (): Loading => ({ _tag: "Loading" });

/**
 * Stores a successful result without copying or modifying its value.
 */
export const succeed = <A>(value: A): Success<A> => ({
  _tag: "Success",
  value,
});

/**
 * Stores a failed result without copying or modifying its error.
 */
export const fail = <E>(error: E): Failure<E> => ({
  _tag: "Failure",
  error,
});

/**
 * Builds a Model field schema, preserving the supplied value and error codecs.
 * Query results are plain tagged records, so decoding needs no prototype
 * repair.
 */
export const Schema = <
  Value extends EffectSchema.Constraint,
  Error extends EffectSchema.Constraint,
>(
  value: Value,
  error: Error,
) =>
  EffectSchema.TaggedUnion({
    Loading: {},
    Success: { value },
    Failure: { error },
  });

/**
 * Narrows a query result to its loading variant.
 */
export const isLoading = <A, E>(self: QueryResult<A, E>): self is Loading =>
  self._tag === "Loading";

/**
 * Narrows a query result to its success variant.
 */
export const isSuccess = <A, E>(self: QueryResult<A, E>): self is Success<A> =>
  self._tag === "Success";

/**
 * Narrows a query result to its failure variant.
 */
export const isFailure = <A, E>(self: QueryResult<A, E>): self is Failure<E> =>
  self._tag === "Failure";

/**
 * Matches all three states, passing only the value or error to its handler.
 */
export const match: {
  <A, E, X, Y, Z>(handlers: {
    readonly onLoading: () => X;
    readonly onSuccess: (value: A) => Y;
    readonly onFailure: (error: E) => Z;
  }): (self: QueryResult<A, E>) => X | Y | Z;
  <A, E, X, Y, Z>(
    self: QueryResult<A, E>,
    handlers: {
      readonly onLoading: () => X;
      readonly onSuccess: (value: A) => Y;
      readonly onFailure: (error: E) => Z;
    },
  ): X | Y | Z;
} = Function.dual(
  2,
  <A, E, X, Y, Z>(
    self: QueryResult<A, E>,
    handlers: {
      readonly onLoading: () => X;
      readonly onSuccess: (value: A) => Y;
      readonly onFailure: (error: E) => Z;
    },
  ): X | Y | Z => {
    switch (self._tag) {
      case "Loading":
        return handlers.onLoading();
      case "Success":
        return handlers.onSuccess(self.value);
      case "Failure":
        return handlers.onFailure(self.error);
    }
  },
);
