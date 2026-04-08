import * as Ref from "@confect/core/Ref";
import { type GenericActionCtx } from "convex/server";
import { Context, Layer } from "effect";

const make =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends Ref.AnyAction>(action: Action, args: Ref.Args<Action>) =>
    Ref.runWithCodec(action, args, (functionReference, encodedArgs) =>
      runAction(functionReference, encodedArgs),
    );

export const ActionRunner = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/ActionRunner",
);
export type ActionRunner = typeof ActionRunner.Identifier;

export const layer = (runAction: GenericActionCtx<any>["runAction"]) =>
  Layer.succeed(ActionRunner, make(runAction));
