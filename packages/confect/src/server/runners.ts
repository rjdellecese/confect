import {
  getFunctionName,
  type FunctionReference,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type OptionalRestArgs,
} from "convex/server";
import { Context, Effect, Layer, Schema } from "effect";

const makeQueryRunner =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) =>
    Effect.promise(() => runQuery(query, ...args));

const makeMutationRunner =
  (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  <Mutation extends FunctionReference<"mutation", "public" | "internal">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) =>
    Effect.tryPromise({
      try: () => runMutation(mutation, ...args),
      catch: (error) =>
        new MutationRollback({
          mutationName: getFunctionName(mutation),
          error,
        }),
    });

const makeActionRunner =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) =>
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

export class MutationRollback extends Schema.TaggedError<MutationRollback>(
  "MutationRollback",
)("MutationRollback", {
  mutationName: Schema.String,
  error: Schema.Unknown,
}) {
  /* v8 ignore start */
  override get message(): string {
    return `Mutation ${this.mutationName} failed and was rolled back.\n\n${this.error}`;
  }
  /* v8 ignore stop */
}
