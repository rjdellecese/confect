import {
  type FunctionReference,
  type GenericActionCtx,
  type OptionalRestArgs,
} from "convex/server";
import { Context, Effect, Layer } from "effect";

const makeActionRunner =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) =>
    Effect.promise(() => runAction(action, ...args));

export const ConfectActionRunner = Context.GenericTag<
  ReturnType<typeof makeActionRunner>
>("@rjdellecese/confect/ConfectActionRunner");
export type ConfectActionRunner = typeof ConfectActionRunner.Identifier;

export const layer = (runAction: GenericActionCtx<any>["runAction"]) =>
  Layer.succeed(ConfectActionRunner, makeActionRunner(runAction));
