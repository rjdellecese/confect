import * as Ref from "@confect/core/Ref";
import type { GenericActionCtx } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";
import * as MutationTransactionContext from "./MutationTransactionContext";
import * as QueryTransactionContext from "./QueryTransactionContext";

/**
 * Nested-query transaction controls. `transactionLimits` is supported in
 * queries/mutations; specifying `useStaleSnapshot` (even false) requires a
 * mutation. Omit options entirely in actions and HTTP handlers.
 *
 * @category Options
 */
export type Options = MutationTransactionContext.QueryOptions;

const run = Effect.fn("QueryRunner.runQuery")(
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => effect,
);

const make = (nativeRunQuery: GenericActionCtx<any>["runQuery"]) => {
  /**
   * Invoke a query ref with decoded arguments and no transaction overrides.
   *
   * @category Invocation
   *
   * @param query - Generated public or internal query ref.
   * @param args - Decoded arguments, optional for an argument-free ref.
   *
   * @returns An Effect with the decoded result. Declared failures and
   *   SchemaError are typed errors; undeclared/native failures become defects.
   */
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    ...args: [...Ref.OptionalArgs<Query>, options?: undefined]
  ): Effect.Effect<Ref.Returns<Query>, Ref.Error<Query> | Schema.SchemaError>;
  /**
   * Invoke a query with transaction limits in a query or mutation context.
   *
   * @category Invocation
   *
   * @param query - Generated query ref.
   * @param args - Decoded arguments; pass {} for an argument-free ref.
   * @param options - Limits for this nested call, not the entire handler.
   *
   * @returns An Effect with the decoded result and the ref's declared errors or
   *   SchemaError. Native/undeclared failures are defects.
   */
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    args: Ref.Args<Query>,
    options:
      | (QueryTransactionContext.Options & {
          readonly useStaleSnapshot?: never;
        })
      | undefined,
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | Schema.SchemaError,
    QueryTransactionContext.QueryTransactionContext
  >;
  /**
   * Invoke a query with an explicit stale-snapshot choice in a mutation.
   *
   * @category Invocation
   *
   * @param query - Generated query ref.
   * @param args - Decoded arguments, or {} when none are declared.
   * @param options - `useStaleSnapshot` plus optional transaction limits. A
   *   true value may read data older than the enclosing transaction.
   *
   * @returns An Effect with the decoded result and declared/schema failures.
   */
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    args: Ref.Args<Query>,
    options: Options & { readonly useStaleSnapshot: boolean },
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | Schema.SchemaError,
    MutationTransactionContext.MutationTransactionContext
  >;
  /**
   * Invoke a query with dynamically selected transaction options.
   *
   * @category Invocation
   *
   * @param query - Generated query ref.
   * @param args - Decoded arguments.
   * @param options - Controls selected at runtime; the environment must supply
   *   the query/mutation capabilities required by the possible options.
   *
   * @returns An Effect with the decoded result and declared/schema failures.
   */
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    args: Ref.Args<Query>,
    options: Options | undefined,
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | Schema.SchemaError,
    | QueryTransactionContext.QueryTransactionContext
    | MutationTransactionContext.MutationTransactionContext
  >;
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    args?: Ref.Args<Query>,
    options?: Options,
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | Schema.SchemaError,
    | QueryTransactionContext.QueryTransactionContext
    | MutationTransactionContext.MutationTransactionContext
  > {
    return run(
      Effect.gen(function* () {
        const actualArgs = (args ?? {}) as Ref.Args<Query>;
        if (options?.useStaleSnapshot !== undefined) {
          const controls =
            yield* MutationTransactionContext.MutationTransactionContext;
          return yield* controls.runQuery(query, actualArgs, options);
        }
        if (options !== undefined) {
          const controls =
            yield* QueryTransactionContext.QueryTransactionContext;
          return yield* controls.runQuery(query, actualArgs, options);
        }
        return yield* Ref.runWithCodec(query, actualArgs, (ref, encodedArgs) =>
          nativeRunQuery(ref, encodedArgs),
        );
      }),
    );
  }
  return {
    /**
     * Invoke a generated query ref with decoded arguments.
     *
     * @category Invocation
     *
     * @param query - Public or internal query ref.
     * @param args - Decoded arguments; omit for an argument-free ref, or pass
     *   {} before an options argument.
     * @param options - TransactionLimits requires a query/mutation context;
     *   useStaleSnapshot, even false, requires a mutation. Omit options in
     *   actions and HTTP handlers. A true stale-snapshot option permits older
     *   data.
     *
     * @returns An Effect producing the decoded result. Declared errors and
     *   SchemaError are typed failures; native/undeclared failures are
     *   defects.
     */
    runQuery,
  };
};

/**
 * Query invocation service. Acquire the generated `QueryRunner` tag in queries,
 * mutations, actions or HTTP handlers, then call the returned `runQuery`
 * method.
 *
 * @category Services
 */
export const QueryRunner =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/server/QueryRunner");
/**
 * Effect requirement identifier for the generated query invocation service.
 *
 * @category Services
 */
export type QueryRunner = typeof QueryRunner.Identifier;

/**
 * @internal
 */
export const layer = (runQuery: GenericActionCtx<any>["runQuery"]) =>
  Layer.succeed(QueryRunner, make(runQuery));
