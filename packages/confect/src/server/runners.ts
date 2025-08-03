import type {
  FunctionReference,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  OptionalRestArgs,
} from "convex/server";
import { Context, Effect, Layer } from "effect";

const makeQueryRunner =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) =>
    // TODO: Which errors might occur?
    Effect.promise(() => runQuery(query, ...args));

const makeMutationRunner =
  (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  <Mutation extends FunctionReference<"mutation", "public" | "internal">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) =>
    // TODO: Which errors might occur?
    Effect.promise(() => runMutation(mutation, ...args));

const makeActionRunner =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) =>
    // TODO: Which errors might occur?
    Effect.promise(() => runAction(action, ...args));

export const ConfectQueryRunner = Context.GenericTag<
  ReturnType<typeof makeQueryRunner>
>("@rjdellecese/confect/ConfectQueryRunner");
export type ConfectQueryRunner = typeof ConfectQueryRunner.Identifier;

export const confectQueryRunnerLayer = (
  runQuery: GenericQueryCtx<any>["runQuery"],
) => Layer.succeed(ConfectQueryRunner, makeQueryRunner(runQuery));

export const ConfectMutationRunner = Context.GenericTag<
  ReturnType<typeof makeMutationRunner>
>("@rjdellecese/confect/ConfectMutationRunner");
export type ConfectMutationRunner = typeof ConfectMutationRunner.Identifier;

export const confectMutationRunnerLayer = (
  runMutation: GenericMutationCtx<any>["runMutation"],
) => Layer.succeed(ConfectMutationRunner, makeMutationRunner(runMutation));

export const ConfectActionRunner = Context.GenericTag<
  ReturnType<typeof makeActionRunner>
>("@rjdellecese/confect/ConfectActionRunner");
export type ConfectActionRunner = typeof ConfectActionRunner.Identifier;

export const confectActionRunnerLayer = (
  runAction: GenericActionCtx<any>["runAction"],
) => Layer.succeed(ConfectActionRunner, makeActionRunner(runAction));
