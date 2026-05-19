import * as Ref from "@confect/core/Ref";
import { type GenericActionCtx } from "convex/server";
import type { Effect, Schema } from "effect";
import { Context, Layer } from "effect";

const make =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends Ref.AnyAction>(
    action: Action,
    ...args: Ref.OptionalArgs<Action>
  ): Effect.Effect<
    Ref.Returns<Action>,
    Ref.Error<Action> | Schema.SchemaError
  > =>
    Ref.runWithCodec(
      action,
      (args[0] ?? {}) as Ref.Args<Action>,
      (functionReference, encodedArgs) =>
        runAction(functionReference, encodedArgs),
    );

export const ActionRunner = Context.Service<ReturnType<typeof make>>(
  "@confect/server/ActionRunner",
);
export type ActionRunner = typeof ActionRunner.Identifier;

export const layer = (runAction: GenericActionCtx<any>["runAction"]) =>
  Layer.succeed(ActionRunner, make(runAction));
