import {
  type FunctionReference,
  type GenericQueryCtx,
  type OptionalRestArgs,
} from "convex/server";
import { Context, Effect, Layer } from "effect";

const makeQueryRunner =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) =>
    Effect.promise(() => runQuery(query, ...args));

export const ConfectQueryRunner = Context.GenericTag<
  ReturnType<typeof makeQueryRunner>
>("@rjdellecese/confect/ConfectQueryRunner");
export type ConfectQueryRunner = typeof ConfectQueryRunner.Identifier;

export const layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  Layer.succeed(ConfectQueryRunner, makeQueryRunner(runQuery));
