import * as Ref from "@confect/core/Ref";
import { type GenericQueryCtx } from "convex/server";
import type { Effect } from "effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";

const make =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends Ref.AnyQuery>(
    query: Query,
    ...args: Ref.OptionalArgs<Query>
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | Schema.SchemaError
  > =>
    Ref.runWithCodec(
      query,
      (args[0] ?? {}) as Ref.Args<Query>,
      (functionReference, encodedArgs) =>
        runQuery(functionReference, encodedArgs),
    );

export const QueryRunner = Context.Service<ReturnType<typeof make>>(
  "@confect/server/QueryRunner",
);
export type QueryRunner = typeof QueryRunner.Identifier;

export const layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  Layer.succeed(QueryRunner, make(runQuery));
