import type {
  FunctionReference,
  GenericMutationCtx,
  OptionalRestArgs,
} from "convex/server";
import { Context, Effect } from "effect";

export class ConvexMutationRunner extends Context.Tag(
  "@rjdellecese/confect/ConvexMutationRunner",
)<
  ConvexMutationRunner,
  // TODO: Need to wire in Confect types here, and do decoding/encoding.
  GenericMutationCtx<any>["runMutation"]
>() {
  static provide = (runMutation: GenericMutationCtx<any>["runMutation"]) =>
    Effect.provideService(this, runMutation);
}

export class ConfectMutationRunner extends Effect.Service<ConfectMutationRunner>()(
  "@rjdellecese/confect/ConfectMutationRunner",
  {
    succeed: {
      // TODO: Which errors might occur?
      runMutation: <
        Mutation extends FunctionReference<"mutation", "public" | "internal">,
      >(
        mutation: Mutation,
        ...args: OptionalRestArgs<Mutation>
      ) =>
        Effect.gen(function* () {
          const runMutation = yield* ConvexMutationRunner;

          return yield* Effect.promise(() => runMutation(mutation, ...args));
        }),
    },
  },
) {}
