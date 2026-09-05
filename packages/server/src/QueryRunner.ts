import * as Ref from "@confect/core/Ref";
import { type GenericActionCtx } from "convex/server";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";

const run = Effect.fn("QueryRunner.run")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const make =
  (runQuery: GenericActionCtx<any>["runQuery"]) =>
  <Query extends Ref.AnyQuery>(
    query: Query,
    ...args: Ref.OptionalArgs<Query>
  ): Effect.Effect<Ref.Returns<Query>, Ref.Error<Query> | Schema.SchemaError> =>
    run(
      Ref.runWithCodec(
        query,
        (args[0] ?? {}) as Ref.Args<Query>,
        (functionReference, encodedArgs) =>
          runQuery(functionReference, encodedArgs),
      ),
    );

export const QueryRunner = Context.Service<ReturnType<typeof make>>(
  "@confect/server/QueryRunner",
);
export type QueryRunner = typeof QueryRunner.Identifier;

export const layer = (runQuery: GenericActionCtx<any>["runQuery"]) =>
  Layer.succeed(QueryRunner, make(runQuery));
