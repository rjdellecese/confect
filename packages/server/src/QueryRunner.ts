import * as Ref from "@confect/core/Ref";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";
import * as MutationTransactionContext from "./MutationTransactionContext";
import * as QueryTransactionContext from "./QueryTransactionContext";

/**
 * Transaction controls for a nested query: `transactionLimits` bounds resource
 * use, and `useStaleSnapshot` lets a mutation opt into an older read.
 *
 * **Gotchas**
 *
 * Limits require a query or mutation. Setting `useStaleSnapshot`, even to
 * `false`, requires a mutation. In actions and HTTP handlers, omit the options
 * object rather than passing `{}`.
 *
 * @category Configuration
 */
export type Options = MutationTransactionContext.QueryOptions;

const run = Effect.fn("QueryRunner.runQuery")(
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => effect,
);

const make = (
  nativeRunQuery: GenericActionCtx<GenericDataModel>["runQuery"],
) => {
  /**
   * Runs a query with decoded arguments and no transaction overrides in any
   * function context.
   *
   * @category Running
   *
   * @param query - Generated public or internal query ref.
   * @param args - Decoded arguments; omit for an argument-free ref.
   *
   * @returns An Effect producing the decoded result. Declared errors and
   *   `SchemaError` are typed failures; unexpected Convex failures are
   *   defects.
   */
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    ...args: [...Ref.OptionalArgs<Query>, options?: undefined]
  ): Effect.Effect<Ref.Returns<Query>, Ref.Error<Query> | Schema.SchemaError>;
  /**
   * Runs a nested query with resource limits set by the enclosing query or
   * mutation.
   *
   * @category Running
   *
   * @param query - Generated public or internal query ref.
   * @param args - Decoded arguments; pass `{}` for an argument-free ref.
   * @param options - Limits for the nested call, not the entire handler.
   *
   * @returns An Effect producing the decoded result. Declared errors and
   *   `SchemaError` are typed failures; unexpected Convex failures are
   *   defects.
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
   * Runs a query from a mutation with an explicit snapshot choice. Setting
   * `useStaleSnapshot` to `true` permits data older than the enclosing
   * transaction.
   *
   * @category Running
   *
   * @param query - Generated public or internal query ref.
   * @param args - Decoded arguments; pass `{}` for an argument-free ref.
   * @param options - The `useStaleSnapshot` flag and optional resource limits.
   *
   * @returns An Effect producing the decoded result. Declared errors and
   *   `SchemaError` are typed failures; unexpected Convex failures are
   *   defects.
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
   * Runs a query with transaction options selected at runtime.
   *
   * @category Running
   *
   * @param query - Generated public or internal query ref.
   * @param args - Decoded arguments; pass `{}` for an argument-free ref.
   * @param options - Transaction controls. If the type permits both limits and
   *   a stale-snapshot choice, the Effect requires both the query and mutation
   *   transaction services.
   *
   * @returns An Effect producing the decoded result. Declared errors and
   *   `SchemaError` are typed failures; unexpected Convex failures are
   *   defects.
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
     * Runs a generated query with decoded arguments and returns its decoded
     * result. Queries and mutations can bound the nested call with
     * `transactionLimits`.
     *
     * **Gotchas**
     *
     * Passing `useStaleSnapshot`, even `false`, requires a mutation. Setting it
     * to `true` permits stale reads. In actions and HTTP handlers, omit the
     * options object rather than passing `{}`.
     *
     * @category Running
     *
     * @param query - Generated public or internal query ref.
     * @param args - Decoded arguments; omit for an argument-free ref, or pass
     *   `{}` before options.
     * @param options - Transaction limits or snapshot choice for this query.
     *
     * @returns An Effect producing the decoded result. Declared errors and
     *   `SchemaError` are typed failures; unexpected Convex failures are
     *   defects.
     */
    runQuery,
  };
};

/**
 * Tag for running queries from queries, mutations, actions, and HTTP handlers.
 * Yield the generated `QueryRunner` tag and pass a query ref to `runQuery`.
 *
 * @category Tags
 */
export const QueryRunner =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/server/QueryRunner");
/**
 * Effect environment requirement for an operation that calls a query through
 * the generated `QueryRunner` service.
 *
 * @category Context
 */
export type QueryRunner = typeof QueryRunner.Identifier;

/**
 * @internal
 */
export const layer = (
  runQuery: GenericActionCtx<GenericDataModel>["runQuery"],
) => Layer.succeed(QueryRunner, make(runQuery));
