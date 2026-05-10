import { Equal, Function, Hash, identity, Pipeable, Predicate } from "effect";

const TypeId = "@confect/react/QueryResult";
type TypeId = typeof TypeId;

/**
 * A `QueryResult` represents the result of a Confect query.
 *
 * @typeParam A - The type of the decoded `returns` value in the `Success` variant.
 * @typeParam E - The type of the decoded typed error in the `Failure` variant.
 */
export type QueryResult<A, E = never> =
  | Loading<A, E>
  | Success<A, E>
  | Failure<A, E>;

export declare namespace QueryResult {
  export interface Proto<A, E> extends Pipeable.Pipeable {
    readonly [TypeId]: {
      readonly E: (_: never) => E;
      readonly A: (_: never) => A;
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Success<R> = R extends QueryResult<infer A, infer _E> ? A : never;

  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Failure<R> = R extends QueryResult<infer _A, infer E> ? E : never;
}

export interface Loading<A, E = never> extends QueryResult.Proto<A, E> {
  readonly _tag: "Loading";
  readonly skipped: boolean;
}

export interface Success<A, E = never> extends QueryResult.Proto<A, E> {
  readonly _tag: "Success";
  readonly value: A;
}

export interface Failure<A, E = never> extends QueryResult.Proto<A, E> {
  readonly _tag: "Failure";
  readonly error: E;
}

export const isQueryResult = (u: unknown): u is QueryResult<unknown, unknown> =>
  Predicate.hasProperty(u, TypeId);

const QueryResultProto = {
  [TypeId]: {
    E: identity,
    A: identity,
  },
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
    switch (this._tag) {
      case "Loading":
        return this.skipped === (that as Loading<any, any>).skipped;
      case "Success":
        return Equal.equals(this.value, (that as Success<any, any>).value);
      case "Failure":
        return Equal.equals(this.error, (that as Failure<any, any>).error);
    }
  },
  [Hash.symbol](this: QueryResult<any, any>): number {
    const tagHash = Hash.string(this._tag);
    switch (this._tag) {
      case "Loading":
        return Hash.cached(
          this,
          Hash.combine(tagHash)(Hash.hash(this.skipped)),
        );
      case "Success":
        return Hash.cached(this, Hash.combine(tagHash)(Hash.hash(this.value)));
      case "Failure":
        return Hash.cached(this, Hash.combine(tagHash)(Hash.hash(this.error)));
    }
  },
};

export const load = <A = never, E = never>(skipped: boolean): Loading<A, E> =>
  Object.assign(Object.create(QueryResultProto), {
    _tag: "Loading" as const,
    skipped,
  });

export const succeed = <A, E = never>(value: A): Success<A, E> =>
  Object.assign(Object.create(QueryResultProto), {
    _tag: "Success" as const,
    value,
  });

export const fail = <E, A = never>(error: E): Failure<A, E> =>
  Object.assign(Object.create(QueryResultProto), {
    _tag: "Failure" as const,
    error,
  });

export const isLoading = <A, E>(
  queryResult: QueryResult<A, E>,
): queryResult is Loading<A, E> => queryResult._tag === "Loading";

export const isSuccess = <A, E>(
  queryResult: QueryResult<A, E>,
): queryResult is Success<A, E> => queryResult._tag === "Success";

export const isFailure = <A, E>(
  queryResult: QueryResult<A, E>,
): queryResult is Failure<A, E> => queryResult._tag === "Failure";

type MatchOptions<A, E, X, Y, Z> = {
  readonly onLoading: (skipped: boolean) => X;
  readonly onSuccess: (value: A) => Y;
} & ([E] extends [never] ? {} : { readonly onFailure: (error: E) => Z });

type MatchReturns<E, X, Y, Z> = [E] extends [never] ? X | Y : X | Y | Z;

/**
 * Matches a {@link QueryResult} to the appropriate handler based on its tag. If
 * the provided `QueryResult` cannot fail (i.e. `E` is `never`), `onFailure` is
 * not required.
 *
 * @example
 * ```tsx
 * const result = QueryResult.match(queryResult, {
 *   onLoading: (skipped) => skipped ? null : <p>Loading…</p>,
 *   onSuccess: (value) => <p>{value.text}</p>,
 *   onFailure: (error) => <p>Error: {error.message}</p>,
 * });
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
  ): MatchReturns<E, X, Y, Z> => {
    switch (self._tag) {
      case "Loading":
        return options.onLoading(self.skipped);
      case "Success":
        return options.onSuccess(self.value);
      case "Failure": {
        if (Predicate.hasProperty(options, "onFailure")) {
          return options.onFailure(self.error) as MatchReturns<E, X, Y, Z>;
        }
        throw new Error(
          "`onFailure` is required when error schema is provided",
        );
      }
    }
  },
);
