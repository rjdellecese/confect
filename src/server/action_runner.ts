import type {
  FunctionReference,
  GenericActionCtx,
  OptionalRestArgs,
} from "convex/server";
import { Context, Effect } from "effect";

export class ConvexActionRunner extends Context.Tag(
  "@rjdellecese/confect/ConvexActionRunner",
)<
  ConvexActionRunner,
  // TODO: Need to wire in Confect types here, and do decoding/encoding.
  GenericActionCtx<any>["runAction"]
>() {
  static provide = (runAction: GenericActionCtx<any>["runAction"]) =>
    Effect.provideService(this, runAction);
}

export class ConfectActionRunner extends Effect.Service<ConfectActionRunner>()(
  "@rjdellecese/confect/ConfectActionRunner",
  {
    succeed: {
      // TODO: Which errors might occur?
      runAction: <
        Action extends FunctionReference<"action", "public" | "internal">,
      >(
        action: Action,
        ...args: OptionalRestArgs<Action>
      ) =>
        Effect.gen(function* () {
          const runAction = yield* ConvexActionRunner;

          return yield* Effect.promise(() => runAction(action, ...args));
        }),
    },
  },
) {}
