import type {
  FunctionReference,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  OptionalRestArgs,
} from "convex/server";
import { Effect, Layer } from "effect";

const makeQueryRunner = (runQuery: GenericQueryCtx<any>["runQuery"]) => ({
  runQuery: <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) =>
    // TODO: Which errors might occur?
    Effect.promise(() => runQuery(query, ...args)),
});

const makeMutationRunner = (
  runMutation: GenericMutationCtx<any>["runMutation"],
) => ({
  runMutation: <
    Mutation extends FunctionReference<"mutation", "public" | "internal">,
  >(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) =>
    // TODO: Which errors might occur?
    Effect.promise(() => runMutation(mutation, ...args)),
});

const makeActionRunner = (runAction: GenericActionCtx<any>["runAction"]) => ({
  runAction: <
    Action extends FunctionReference<"action", "public" | "internal">,
  >(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) =>
    // TODO: Which errors might occur?
    Effect.promise(() => runAction(action, ...args)),
});

// @effect-diagnostics-next-line leakingRequirements:off
export class ConfectQueryRunner extends Effect.Tag(
  "@rjdellecese/confect/ConfectQueryRunner",
)<ConfectQueryRunner, ReturnType<typeof makeQueryRunner>>() {
  static readonly layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
    Layer.succeed(this, makeQueryRunner(runQuery));
}

// @effect-diagnostics-next-line leakingRequirements:off
export class ConfectMutationRunner extends Effect.Tag(
  "@rjdellecese/confect/ConfectMutationRunner",
)<ConfectMutationRunner, ReturnType<typeof makeMutationRunner>>() {
  static readonly layer = (
    runMutation: GenericMutationCtx<any>["runMutation"],
  ) => Layer.succeed(this, makeMutationRunner(runMutation));
}

// @effect-diagnostics-next-line leakingRequirements:off
export class ConfectActionRunner extends Effect.Tag(
  "@rjdellecese/confect/ConfectActionRunner",
)<ConfectActionRunner, ReturnType<typeof makeActionRunner>>() {
  static readonly layer = (runAction: GenericActionCtx<any>["runAction"]) =>
    Layer.succeed(this, makeActionRunner(runAction));
}
