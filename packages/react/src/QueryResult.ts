/**
 * States and helpers for rendering a reactive query as it loads, succeeds, or
 * returns a declared error.
 *
 * @module
 *
 * @category Models
 */
import * as Equal from "effect/Equal";
import * as Function from "effect/Function";
import * as Hash from "effect/Hash";
import * as Match from "effect/Match";
import * as Pipeable from "effect/Pipeable";
import * as Predicate from "effect/Predicate";

const TypeId = "~@confect/react/QueryResult";
type TypeId = typeof TypeId;

/**
 * The state of a reactive query: pending or skipped, a decoded value, or a
 * decoded declared error.
 *
 * @category Models
 *
 * @typeParam A - The type of the decoded `returns` value in the `Success`
 *   variant.
 * @typeParam E - The type of the decoded typed error in the `Failure` variant.
 *
 * @see {@link match} to handle the result by state.
 */
export type QueryResult<A, E = never> =
  | Loading<A, E>
  | Success<A, E>
  | Failure<A, E>;

/**
 * Type utilities for extracting a query result's success and error types.
 *
 * @category Utility types
 */
export declare namespace QueryResult {
  /**
   * Shared pipeable shape; the phantom fields describe types, not runtime data.
   *
   * @category Prototypes
   */
  export interface Proto<out A, out E> extends Pipeable.Pipeable {
    /**
     * Brand shared by all query result variants.
     *
     * @category Type IDs
     */
    readonly [TypeId]: TypeId;
    /**
     * Type-only witness for the decoded success value.
     *
     * @category Utility types
     */
    readonly "~A": A;
    /**
     * Type-only witness for the decoded declared error.
     *
     * @category Utility types
     */
    readonly "~E": E;
  }

  /**
   * Extracts the decoded success type from a result type, or `never` otherwise.
   *
   * @category Utility types
   */
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Success<R> = R extends { readonly "~A": infer A } ? A : never;

  /**
   * Extracts the declared error type from a result type, or `never` otherwise.
   *
   * @category Utility types
   */
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Failure<R> = R extends { readonly "~E": infer E } ? E : never;
}

/**
 * No query value is available yet, either while loading or because it was
 * skipped.
 *
 * @category Models
 */
export interface Loading<A, E = never> extends QueryResult.Proto<A, E> {
  /**
   * Discriminant for narrowing to the pending/skipped state.
   *
   * @category Models
   */
  readonly _tag: "Loading";
  /**
   * `true` when the hook received `"skip"` and did not subscribe.
   *
   * @category Models
   */
  readonly skipped: boolean;
}

/**
 * A query value decoded through the ref's return schema.
 *
 * @category Models
 */
export interface Success<A, E = never> extends QueryResult.Proto<A, E> {
  /**
   * Discriminant for narrowing to a decoded value.
   *
   * @category Models
   */
  readonly _tag: "Success";
  /**
   * The decoded query result, not its Convex wire representation.
   *
   * @category Models
   */
  readonly value: A;
}

/**
 * A declared query error; undeclared failures are thrown by the hook instead.
 *
 * @category Models
 */
export interface Failure<A, E = never> extends QueryResult.Proto<A, E> {
  /**
   * Discriminant for narrowing to a declared error.
   *
   * @category Models
   */
  readonly _tag: "Failure";
  /**
   * The failure decoded through the ref's error schemas.
   *
   * @category Models
   */
  readonly error: E;
}

/**
 * @internal
 */
export const isQueryResult = (u: unknown): u is QueryResult<unknown, unknown> =>
  Predicate.hasProperty(u, TypeId);

class QueryResultProto<A, E>
  extends Pipeable.Class
  implements QueryResult.Proto<A, E>
{
  declare readonly "~A": A;
  declare readonly "~E": E;
  get [TypeId](): TypeId {
    return TypeId;
  }
  [Equal.symbol](
    this: QueryResult<unknown, unknown>,
    that: QueryResult<unknown, unknown>,
  ): boolean {
    return Match.value(this).pipe(
      Match.tag(
        "Loading",
        (self) => that._tag === "Loading" && self.skipped === that.skipped,
      ),
      Match.tag(
        "Success",
        (self) =>
          that._tag === "Success" && Equal.equals(self.value, that.value),
      ),
      Match.tag(
        "Failure",
        (self) =>
          that._tag === "Failure" && Equal.equals(self.error, that.error),
      ),
      Match.exhaustive,
    );
  }
  [Hash.symbol](this: QueryResult<unknown, unknown>): number {
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
  }
}

/**
 * @internal
 */
export const load = <A = never, E = never>(skipped: boolean): Loading<A, E> =>
  Object.assign(new QueryResultProto<A, E>(), {
    _tag: "Loading" as const,
    skipped,
  });

/**
 * @internal
 */
export const succeed = <A, E = never>(value: A): Success<A, E> =>
  Object.assign(new QueryResultProto<A, E>(), {
    _tag: "Success" as const,
    value,
  });

/**
 * @internal
 */
export const fail = <E, A = never>(error: E): Failure<A, E> =>
  Object.assign(new QueryResultProto<A, E>(), {
    _tag: "Failure" as const,
    error,
  });

/**
 * Narrows `queryResult` to `Loading`, including skipped queries; inspect
 * `skipped` to distinguish them.
 *
 * @category Guards
 */
export const isLoading = <A, E>(
  queryResult: QueryResult<A, E>,
): queryResult is Loading<A, E> => queryResult._tag === "Loading";

/**
 * Narrows `queryResult` to `Success`, making its decoded `value` available.
 *
 * @category Guards
 */
export const isSuccess = <A, E>(
  queryResult: QueryResult<A, E>,
): queryResult is Success<A, E> => queryResult._tag === "Success";

/**
 * Narrows `queryResult` to `Failure`, making its decoded declared `error`
 * available.
 *
 * @category Guards
 */
export const isFailure = <A, E>(
  queryResult: QueryResult<A, E>,
): queryResult is Failure<A, E> => queryResult._tag === "Failure";

type MatchOptions<A, E, X, Y, Z> = {
  /**
   * Handles loading or skipped queries; the argument is `true` only when
   * skipped.
   *
   * @category Folding
   */
  readonly onLoading: (skipped: boolean) => X;
  /**
   * Handles the decoded query value and returns your branch result.
   *
   * @category Folding
   */
  readonly onSuccess: (value: A) => Y;
} & ([E] extends [never]
  ? object
  : {
      /**
       * Handles the decoded declared error; required when the error type is not
       * `never`.
       *
       * @category Folding
       */
      readonly onFailure: (error: E) => Z;
    });

type MatchReturns<E, X, Y, Z> = [E] extends [never] ? X | Y : X | Y | Z;

/**
 * Returns the value of the handler for the current {@link QueryResult} state.
 * Only a query that declares an error needs an `onFailure` handler.
 *
 * **Example** (Rendering a note or its query error)
 *
 * ```ts
 * import * as QueryResult from "@confect/react/QueryResult";
 *
 * export const noteText = (
 *   result: QueryResult.QueryResult<{ text: string }, Error>,
 * ) =>
 *   QueryResult.match(result, {
 *     onLoading: (skipped) => (skipped ? null : "Loading…"),
 *     onSuccess: (note) => note.text,
 *     onFailure: (error) => `Error: ${error.message}`,
 *   });
 * ```
 *
 * @category Folding
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- match excludes Z when E is never: only a Failure can invoke onFailure, and its error must be an E.
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
