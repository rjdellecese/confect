import * as Function from "effect/Function";
import * as Equal from "effect/Equal";
import * as Hash from "effect/Hash";
import * as Match from "effect/Match";
import * as Pipeable from "effect/Pipeable";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

const TypeId = "~@confect/foldkit/QueryResult";

interface Proto extends Pipeable.Pipeable, Equal.Equal {
  readonly [TypeId]: typeof TypeId;
}

/**
 * A query awaiting its first result for the current arguments.
 */
export interface Loading extends Proto {
  readonly _tag: "Loading";
}

/**
 * The latest successful query result.
 */
export interface Success<A> extends Proto {
  readonly _tag: "Success";
  readonly value: A;
}

/**
 * The latest query error, which does not imply the subscription has ended.
 */
export interface Failure<E> extends Proto {
  readonly _tag: "Failure";
  readonly error: E;
}

/**
 * The current result of a reactive query in a Foldkit Model. Subscription
 * eligibility belongs to the Model's subscription dependencies, not this value.
 * Subsequent results replace the previous success or failure without entering a
 * refreshing state. Values support piping and Effect equality and hashing.
 * Equality compares the variant and delegates payload comparison to Effect's
 * structural equality.
 */
export type QueryResult<A, E = never> = Loading | Success<A> | Failure<E>;

/**
 * Identifies values constructed by this module, including decoded results.
 */
export const isQueryResult = (
  input: unknown,
): input is QueryResult<unknown, unknown> =>
  Predicate.hasProperty(input, TypeId) && input[TypeId] === TypeId;

const Proto = {
  [TypeId]: TypeId,
  pipe(this: QueryResult<unknown, unknown>, ...args: ReadonlyArray<unknown>) {
    return Pipeable.pipeArguments(
      this,
      args as unknown as Parameters<typeof Pipeable.pipeArguments>[1],
    );
  },
  [Equal.symbol](
    this: QueryResult<unknown, unknown>,
    that: Equal.Equal,
  ): boolean {
    if (!isQueryResult(that)) return false;
    return Match.value(this).pipe(
      Match.tag("Loading", () => isLoading(that)),
      Match.tag(
        "Success",
        ({ value }) => isSuccess(that) && Equal.equals(value, that.value),
      ),
      Match.tag(
        "Failure",
        ({ error }) => isFailure(that) && Equal.equals(error, that.error),
      ),
      Match.exhaustive,
    );
  },
  [Hash.symbol](this: QueryResult<unknown, unknown>): number {
    const tagHash = Hash.combine(Hash.string(TypeId))(Hash.string(this._tag));
    return Match.value(this).pipe(
      Match.tag("Loading", () => tagHash),
      Match.tag("Success", ({ value }) =>
        Hash.combine(tagHash)(Hash.hash(value)),
      ),
      Match.tag("Failure", ({ error }) =>
        Hash.combine(tagHash)(Hash.hash(error)),
      ),
      Match.exhaustive,
    );
  },
};

/**
 * Constructs a query awaiting its first result.
 */
export const load = (): Loading =>
  Object.assign(Object.create(Proto), { _tag: "Loading" });

/**
 * Stores a successful result without copying or modifying its value.
 */
export const succeed = <A>(value: A): Success<A> =>
  Object.assign(Object.create(Proto), {
    _tag: "Success",
    value,
  });

/**
 * Stores a failed result without copying or modifying its error.
 */
export const fail = <E>(error: E): Failure<E> =>
  Object.assign(Object.create(Proto), {
    _tag: "Failure",
    error,
  });

/**
 * Builds a Model field schema, preserving the supplied value and error codecs.
 * Encodes tagged records and restores piping, equality, and hashing on decode.
 */
export const QueryResult = <A, AI, E, EI, RD, RE, ERD, ERE>(
  valueSchema: Schema.Codec<A, AI, RD, RE>,
  errorSchema: Schema.Codec<E, EI, ERD, ERE>,
) => {
  const encoded = Schema.TaggedUnion({
    Loading: {},
    Success: { value: valueSchema },
    Failure: { error: errorSchema },
  });
  const decoded = Schema.toType(encoded);
  return encoded.pipe(
    Schema.decodeTo(
      Schema.declare<QueryResult<A, E>>(
        (input): input is QueryResult<A, E> =>
          isQueryResult(input) && Schema.is(decoded)(input),
      ),
      {
        decode: SchemaGetter.transform((input) =>
          Match.value(input).pipe(
            Match.tag("Loading", load),
            Match.tag("Success", ({ value }) => succeed(value)),
            Match.tag("Failure", ({ error }) => fail(error)),
            Match.exhaustive,
          ),
        ),
        encode: SchemaGetter.transform((input) =>
          Match.value(input).pipe(
            Match.tag("Loading", () => ({ _tag: "Loading" as const })),
            Match.tag("Success", ({ value }) => ({
              _tag: "Success" as const,
              value,
            })),
            Match.tag("Failure", ({ error }) => ({
              _tag: "Failure" as const,
              error,
            })),
            Match.exhaustive,
          ),
        ),
      },
    ),
  );
};

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
  ): X | Y | Z =>
    Match.value(self).pipe(
      Match.tag("Loading", () => handlers.onLoading()),
      Match.tag("Success", ({ value }) => handlers.onSuccess(value)),
      Match.tag("Failure", ({ error }) => handlers.onFailure(error)),
      Match.exhaustive,
    ) as X | Y | Z,
);
