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
  /**
   * Brand shared by query results constructed or decoded by this module.
   *
   * @category Models
   */
  readonly [TypeId]: typeof TypeId;
}

/**
 * A query awaiting its first result for the current arguments.
 *
 * @category Models
 */
export interface Loading extends Proto {
  /**
   * Discriminant for a result waiting on an application-scheduled query.
   *
   * @category Models
   */
  readonly _tag: "Loading";
}

/**
 * The latest successful query result.
 *
 * @category Models
 */
export interface Success<A> extends Proto {
  /**
   * Discriminant for a successful result.
   *
   * @category Models
   */
  readonly _tag: "Success";
  /**
   * Decoded value, or the value mapped into the Model by the application's
   * handler.
   *
   * @category Models
   */
  readonly value: A;
}

/**
 * The latest query error, which does not imply the subscription has ended.
 *
 * @category Models
 */
export interface Failure<E> extends Proto {
  /**
   * Discriminant for a failed result.
   *
   * @category Models
   */
  readonly _tag: "Failure";
  /**
   * Failure value stored by the application; a later success can replace it.
   *
   * @category Models
   */
  readonly error: E;
}

/**
 * The latest result of a reactive query in a Foldkit Model. Each success or
 * failure replaces the previous result without an intermediate refreshing
 * state. The Model's subscription dependencies, not this value, decide whether
 * to listen.
 *
 * **Details**
 *
 * Results support piping, equality, and hashing. Equality compares the variant
 * and delegates value or error comparison to Effect.
 *
 * @category Models
 */
export type QueryResult<A, E = never> = Loading | Success<A> | Failure<E>;

/**
 * Identifies values constructed by this module, including decoded results.
 *
 * @internal
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
 * Creates a loading result for a Model field. It does not open or restart the
 * query subscription.
 *
 * @category Constructors
 */
export const load = (): Loading =>
  Object.assign(Object.create(Proto), { _tag: "Loading" });

/**
 * Creates a success result that retains the supplied value unchanged.
 *
 * @category Constructors
 */
export const succeed = <A>(value: A): Success<A> =>
  Object.assign(Object.create(Proto), {
    _tag: "Success",
    value,
  });

/**
 * Creates a failure result that retains the supplied error unchanged.
 *
 * @category Constructors
 */
export const fail = <E>(error: E): Failure<E> =>
  Object.assign(Object.create(Proto), {
    _tag: "Failure",
    error,
  });

/**
 * Creates a codec for a query result stored in the Model. It encodes tagged
 * records with the supplied payload codecs and restores piping, equality, and
 * hashing when decoding.
 *
 * **Gotchas**
 *
 * The error codec defaults to `Schema.Never`. Supply an error codec if the
 * Model stores failed results.
 *
 * **Example** (Initializing a Model field for a list of notes)
 *
 * ```ts
 * import * as QueryResult from "@confect/foldkit/QueryResult";
 * import * as Schema from "effect/Schema";
 *
 * const Notes = QueryResult.QueryResult(
 *   Schema.Array(Schema.String),
 *   Schema.String,
 * );
 * export const initial: typeof Notes.Type = QueryResult.load();
 * ```
 *
 * @category Schemas
 *
 * @param valueSchema - Codec for Success.value, including its encoded form and
 *   services.
 * @param errorSchema - Codec for Failure.error; omit when failures are not
 *   stored here.
 *
 * @returns A codec for Loading, Success and Failure records. Schema failures
 *   and service requirements follow the supplied codecs.
 */
export const QueryResult = <
  A,
  AI,
  E = never,
  EI = never,
  RD = never,
  RE = never,
  ERD = never,
  ERE = never,
>(
  valueSchema: Schema.Codec<A, AI, RD, RE>,
  errorSchema: Schema.Codec<E, EI, ERD, ERE> = Schema.Never,
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
 *
 * @category Guards
 */
export const isLoading = <A, E>(self: QueryResult<A, E>): self is Loading =>
  self._tag === "Loading";

/**
 * Narrows a query result to its success variant.
 *
 * @category Guards
 */
export const isSuccess = <A, E>(self: QueryResult<A, E>): self is Success<A> =>
  self._tag === "Success";

/**
 * Narrows a query result to its failure variant.
 *
 * @category Guards
 */
export const isFailure = <A, E>(self: QueryResult<A, E>): self is Failure<E> =>
  self._tag === "Failure";

/**
 * Returns the result of the handler for the current variant. `onLoading` takes
 * no arguments; `onSuccess` and `onFailure` receive the stored value and error
 * respectively. Supports both `match(self, handlers)` and pipeable
 * `match(handlers)(self)`.
 *
 * **Gotchas**
 *
 * All three handlers are required, even when the error type is `never`.
 * Exceptions thrown by a handler propagate.
 *
 * @category Pattern matching
 */
export const match: {
  <A, E, X, Y, Z>(handlers: {
    /**
     * Handles Loading; no payload is supplied.
     *
     * @category Pattern matching
     */
    readonly onLoading: () => X;
    /**
     * Handles Success using its stored value.
     *
     * @category Pattern matching
     */
    readonly onSuccess: (value: A) => Y;
    /**
     * Handles Failure using its stored error.
     *
     * @category Pattern matching
     */
    readonly onFailure: (error: E) => Z;
  }): (self: QueryResult<A, E>) => X | Y | Z;
  <A, E, X, Y, Z>(
    self: QueryResult<A, E>,
    handlers: {
      /**
       * Handles Loading; no payload is supplied.
       *
       * @category Pattern matching
       */
      readonly onLoading: () => X;
      /**
       * Handles Success using its stored value.
       *
       * @category Pattern matching
       */
      readonly onSuccess: (value: A) => Y;
      /**
       * Handles Failure using its stored error.
       *
       * @category Pattern matching
       */
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
