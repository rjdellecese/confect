import * as Ref from "@confect/core/Ref";
import { type GenericActionCtx } from "convex/server";
import type { Effect } from "effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";

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
