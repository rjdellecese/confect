import {
  getFunctionName,
  type FunctionReference,
  type GenericMutationCtx,
  type OptionalRestArgs,
} from "convex/server";
import { Context, Effect, Layer, Schema } from "effect";

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

export const ConfectMutationRunner = Context.GenericTag<
  ReturnType<typeof makeMutationRunner>
>("@rjdellecese/confect/ConfectMutationRunner");
export type ConfectMutationRunner = typeof ConfectMutationRunner.Identifier;

export const layer = (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  Layer.succeed(ConfectMutationRunner, makeMutationRunner(runMutation));

export class MutationRollback extends Schema.TaggedError<MutationRollback>(
  "MutationRollback"
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
