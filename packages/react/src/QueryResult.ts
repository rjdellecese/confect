import * as Equal from "effect/Equal";
import * as Function from "effect/Function";
import * as Hash from "effect/Hash";
import * as Match from "effect/Match";
import * as Pipeable from "effect/Pipeable";
import * as Predicate from "effect/Predicate";

const TypeId = "~@confect/react/QueryResult";
type TypeId = typeof TypeId;

/**
 * A `QueryResult` represents the result of a Confect query.
 *
 * @typeParam A - The type of the decoded `returns` value in the `Success`
 *   variant.
 * @typeParam E - The type of the decoded typed error in the `Failure` variant.
 */
export type QueryResult<A, E = never> =
  | Loading<A, E>
  | Success<A, E>
  | Failure<A, E>;

/**
 * Type utilities for extracting a query result's success and error types.
 */
export declare namespace QueryResult {
  /**
   * Shared pipeable shape; the phantom fields describe types, not runtime data.
   */
  export interface Proto<out A, out E> extends Pipeable.Pipeable {
    /**
     * Identifies values created by this module.
     */
    readonly [TypeId]: TypeId;
    /**
     * Type-only witness for the decoded success value.
     */
    readonly "~A": A;
    /**
     * Type-only witness for the decoded declared error.
     */
    readonly "~E": E;
  }

  /**
   * Extracts the decoded success type from a result type, or `never` otherwise.
   */
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Success<R> = R extends { readonly "~A": infer A } ? A : never;

  /**
   * Extracts the declared error type from a result type, or `never` otherwise.
   */
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Failure<R> = R extends { readonly "~E": infer E } ? E : never;
}

/**
 * No query value is available yet, either while loading or because it was
 * skipped.
 */
export interface Loading<A, E = never> extends QueryResult.Proto<A, E> {
  /**
   * Discriminant for narrowing to the pending/skipped state.
   */
  readonly _tag: "Loading";
  /**
   * `true` when the hook received `"skip"` and did not subscribe.
   */
  readonly skipped: boolean;
}

/**
 * A query value decoded through the ref's return schema.
 */
export interface Success<A, E = never> extends QueryResult.Proto<A, E> {
  /**
   * Discriminant for narrowing to a decoded value.
   */
  readonly _tag: "Success";
  /**
   * The decoded query result, not its Convex wire representation.
   */
  readonly value: A;
}

/**
 * A declared query error; undeclared failures are thrown by the hook instead.
 */
export interface Failure<A, E = never> extends QueryResult.Proto<A, E> {
  /**
   * Discriminant for narrowing to a declared error.
   */
  readonly _tag: "Failure";
  /**
   * The failure decoded through the ref's error schemas.
   */
  readonly error: E;
}

/**
 * @internal
 */
export const isQueryResult = (u: unknown): u is QueryResult<unknown, unknown> =>
  Predicate.hasProperty(u, TypeId);

const QueryResultProto = {
  [TypeId]: TypeId,
  pipe(this: QueryResult<any, any>, ...args: ReadonlyArray<unknown>) {
    return Pipeable.pipeArguments(
      this,
      args as unknown as Parameters<typeof Pipeable.pipeArguments>[1],
    );
  },
  [Equal.symbol](
    this: QueryResult<any, any>,
    that: QueryResult<any, any>,
  ): boolean {
    if (this._tag !== that._tag) {
      return false;
    }
    return Match.value(this).pipe(
      Match.tag(
        "Loading",
        (self) => self.skipped === (that as Loading<any, any>).skipped,
      ),
      Match.tag("Success", (self) =>
        Equal.equals(self.value, (that as Success<any, any>).value),
      ),
      Match.tag("Failure", (self) =>
        Equal.equals(self.error, (that as Failure<any, any>).error),
      ),
      Match.exhaustive,
    );
  },
  [Hash.symbol](this: QueryResult<any, any>): number {
    const tagHash = Hash.string(this._tag);
    return Match.value(this).pipe(
      Match.tag("Loading", (self) =>
        Hash.combine(tagHash)(Hash.hash(self.skipped)),
      ),
      Match.tag("Success", (self) =>
        Hash.combine(tagHash)(Hash.hash(self.value)),
      ),
      Match.tag("Failure", (self) =>
        Hash.combine(tagHash)(Hash.hash(self.error)),
      ),
      Match.exhaustive,
    );
  },
};

/**
 * @internal
 */
export const load = <A = never, E = never>(skipped: boolean): Loading<A, E> =>
  Object.assign(Object.create(QueryResultProto), {
    _tag: "Loading" as const,
    skipped,
  });

/**
 * @internal
 */
export const succeed = <A, E = never>(value: A): Success<A, E> =>
  Object.assign(Object.create(QueryResultProto), {
    _tag: "Success" as const,
    value,
  });

/**
 * @internal
 */
export const fail = <E, A = never>(error: E): Failure<A, E> =>
  Object.assign(Object.create(QueryResultProto), {
    _tag: "Failure" as const,
    error,
  });

/**
 * Narrows `queryResult` to `Loading`, including skipped queries; inspect
 * `skipped` to distinguish them.
 */
export const isLoading = <A, E>(
  queryResult: QueryResult<A, E>,
): queryResult is Loading<A, E> => queryResult._tag === "Loading";

/**
 * Narrows `queryResult` to `Success`, making its decoded `value` available.
 */
export const isSuccess = <A, E>(
  queryResult: QueryResult<A, E>,
): queryResult is Success<A, E> => queryResult._tag === "Success";

/**
 * Narrows `queryResult` to `Failure`, making its decoded declared `error`
 * available.
 */
export const isFailure = <A, E>(
  queryResult: QueryResult<A, E>,
): queryResult is Failure<A, E> => queryResult._tag === "Failure";

type MatchOptions<A, E, X, Y, Z> = {
  /**
   * Handles loading or skipped queries; the argument is `true` only when
   * skipped.
   */
  readonly onLoading: (skipped: boolean) => X;
  /**
   * Handles the decoded query value and returns your branch result.
   */
  readonly onSuccess: (value: A) => Y;
} & ([E] extends [never]
  ? {}
  : {
      /**
       * Handles the decoded declared error; required when the error type is not
       * `never`.
       */
      readonly onFailure: (error: E) => Z;
    });

type MatchReturns<E, X, Y, Z> = [E] extends [never] ? X | Y : X | Y | Z;

/**
 * Matches a {@link QueryResult} to the appropriate handler based on its tag. If
 * the provided `QueryResult` cannot fail (i.e. `E` is `never`), `onFailure` is
 * not required.
 *
 * @example
 *   const result = QueryResult.match(queryResult, {
 *     onLoading: (skipped) => (skipped ? null : <p>Loading…</p>),
 *     onSuccess: (value) => <p>{value.text}</p>,
 *     onFailure: (error) => <p>Error: {error.message}</p>,
 *   });
 *
 * @param self - The result to inspect, or supply it later in the curried form.
 * @param options - One callback for each possible state, receiving `skipped`,
 *   the decoded value, or the decoded error respectively.
 *
 * @returns The selected callback's return value. Supports both `match(result,
 *   handlers)` and `result.pipe(match(handlers))`.
 *
 * @throws If a runtime `Failure` reaches a handler set without `onFailure`, or
 *   if the selected callback throws.
 */
export const match: {
  <A, E, X, Y, Z = never>(
    options: MatchOptions<A, E, X, Y, Z>,
  ): (self: QueryResult<A, E>) => MatchReturns<E, X, Y, Z>;
  <A, E, X, Y, Z = never>(
    self: QueryResult<A, E>,
    options: MatchOptions<A, E, X, Y, Z>,
  ): MatchReturns<E, X, Y, Z>;
} = Function.dual(
  2,
  <A, E, X, Y, Z = never>(
    self: QueryResult<A, E>,
    options: MatchOptions<A, E, X, Y, Z>,
  ): MatchReturns<E, X, Y, Z> =>
    Match.value(self).pipe(
      Match.tag("Loading", (loading) => options.onLoading(loading.skipped)),
      Match.tag("Success", (success) => options.onSuccess(success.value)),
      Match.tag("Failure", (failure) => {
        if (Predicate.hasProperty(options, "onFailure")) {
          return options.onFailure(failure.error);
        }
        throw new Error(
          "`onFailure` is required when error schema is provided",
        );
      }),
      Match.exhaustive,
    ) as MatchReturns<E, X, Y, Z>,
);
