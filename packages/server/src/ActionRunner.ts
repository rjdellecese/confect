import * as Ref from "@confect/core/Ref";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";

const run = Effect.fn("ActionRunner.runAction")(
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => effect,
);

const make = (runAction: GenericActionCtx<GenericDataModel>["runAction"]) => ({
  /**
   * Runs a generated action with decoded arguments from another action or an
   * HTTP handler. Action calls have no transaction-options argument.
   *
   * @category Running
   *
   * @param action - Generated public or internal action ref.
   * @param args - Decoded arguments; omit for an argument-free ref.
   *
   * @returns An Effect producing the decoded result. Declared errors and
   *   `SchemaError` are typed failures; unexpected Convex failures are
   *   defects.
   */
  runAction: <Action extends Ref.AnyAction>(
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
    ),
});

/**
 * Tag for running other actions from an action or HTTP handler. Yield the
 * generated `ActionRunner` tag and pass an action ref to its `runAction`
 * method.
 *
 * @category Tags
 */
export const ActionRunner =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/server/ActionRunner");
/**
 * Effect environment requirement for an operation that calls another action
 * through the generated `ActionRunner` service.
 *
 * @category Context
 */
export type ActionRunner = typeof ActionRunner.Identifier;

/**
 * @internal
 */
export const layer = (
  runAction: GenericActionCtx<GenericDataModel>["runAction"],
) => Layer.succeed(ActionRunner, make(runAction));
