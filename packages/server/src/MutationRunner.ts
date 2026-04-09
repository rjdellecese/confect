import * as Ref from "@confect/core/Ref";
import { type GenericMutationCtx } from "convex/server";
import { Context, Layer, Schema } from "effect";

const make =
  (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  <Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    ...args: Ref.OptionalArgs<Mutation>
  ) =>
    Ref.runWithCodec(
      mutation,
      (args[0] ?? {}) as Ref.Args<Mutation>,
      (functionReference, encodedArgs) =>
        runMutation(functionReference, encodedArgs),
    );

export const MutationRunner = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/MutationRunner",
);
export type MutationRunner = typeof MutationRunner.Identifier;

export const layer = (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  Layer.succeed(MutationRunner, make(runMutation));

export class MutationRollback extends Schema.TaggedError<MutationRollback>()(
  "MutationRollback",
  {
    mutationName: Schema.String,
    error: Schema.Unknown,
  },
) {
  /* v8 ignore start */
  override get message(): string {
    return `Mutation ${this.mutationName} failed and was rolled back.\n\n${this.error}`;
  }
  /* v8 ignore stop */
}
