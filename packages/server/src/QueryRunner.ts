import * as Ref from "@confect/core/Ref";
import type { GenericActionCtx } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";
import * as MutationTransactionControls from "./MutationTransactionControls";
import * as QueryTransactionControls from "./QueryTransactionControls";

export type Options = MutationTransactionControls.QueryOptions;

const run = Effect.fn("QueryRunner.runQuery")(
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => effect,
);

const make = (nativeRunQuery: GenericActionCtx<any>["runQuery"]) => {
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    ...args: [...Ref.OptionalArgs<Query>, options?: undefined]
  ): Effect.Effect<Ref.Returns<Query>, Ref.Error<Query> | Schema.SchemaError>;
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    args: Ref.Args<Query>,
    options:
      | (QueryTransactionControls.Options & {
          readonly useStaleSnapshot?: never;
        })
      | undefined,
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | Schema.SchemaError,
    QueryTransactionControls.QueryTransactionControls
  >;
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    args: Ref.Args<Query>,
    options: Options & { readonly useStaleSnapshot: boolean },
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | Schema.SchemaError,
    MutationTransactionControls.MutationTransactionControls
  >;
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    args: Ref.Args<Query>,
    options: Options | undefined,
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | Schema.SchemaError,
    | QueryTransactionControls.QueryTransactionControls
    | MutationTransactionControls.MutationTransactionControls
  >;
  function runQuery<Query extends Ref.AnyQuery>(
    query: Query,
    args?: Ref.Args<Query>,
    options?: Options,
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | Schema.SchemaError,
    | QueryTransactionControls.QueryTransactionControls
    | MutationTransactionControls.MutationTransactionControls
  > {
    return run(
      Effect.gen(function* () {
        const actualArgs = (args ?? {}) as Ref.Args<Query>;
        if (options?.useStaleSnapshot !== undefined) {
          const controls =
            yield* MutationTransactionControls.MutationTransactionControls;
          return yield* controls.runQuery(query, actualArgs, options);
        }
        if (options !== undefined) {
          const controls =
            yield* QueryTransactionControls.QueryTransactionControls;
          return yield* controls.runQuery(query, actualArgs, options);
        }
        return yield* Ref.runWithCodec(query, actualArgs, (ref, encodedArgs) =>
          nativeRunQuery(ref, encodedArgs),
        );
      }),
    );
  }
  return { runQuery };
};

export const QueryRunner = Context.Service<ReturnType<typeof make>>(
  "@confect/server/QueryRunner",
);
export type QueryRunner = typeof QueryRunner.Identifier;

export const layer = (runQuery: GenericActionCtx<any>["runQuery"]) =>
  Layer.succeed(QueryRunner, make(runQuery));
