import * as Ref from "@confect/core/Ref";
import { type GenericActionCtx } from "convex/server";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";

const run = Effect.fn("ActionRunner.run")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const make =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends Ref.AnyAction>(
    action: Action,
    ...args: Ref.OptionalArgs<Action>
  ): Effect.Effect<
    Ref.Returns<Action>,
    Ref.Error<Action> | Schema.SchemaError
  > =>
    run(
      Ref.runWithCodec(
        action,
        (args[0] ?? {}) as Ref.Args<Action>,
        (functionReference, encodedArgs) =>
          runAction(functionReference, encodedArgs),
      ),
    );

export const ActionRunner = Context.Service<ReturnType<typeof make>>(
  "@confect/server/ActionRunner",
);
export type ActionRunner = typeof ActionRunner.Identifier;

export const layer = (runAction: GenericActionCtx<any>["runAction"]) =>
  Layer.succeed(ActionRunner, make(runAction));
