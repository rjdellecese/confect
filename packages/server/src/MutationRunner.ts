import { type GenericMutationCtx } from "convex/server";
import { Context, Effect, Layer, Schema } from "effect";
import * as Refs from "@confect/core/Refs";

const makeMutationRunner =
  (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  <Mutation extends Refs.AnyMutation>(
    mutation: Mutation,
    args: Refs.Args<Mutation>["Type"],
  ) =>
    Effect.gen(function* () {
      const function_ = Refs.getFunction(mutation);
      const functionName = Refs.getConvexFunctionName(mutation);

      const encodedArgs = yield* Schema.encode(function_.args)(args);
      const encodedReturns = yield* Effect.promise(() =>
        runMutation(functionName as any, encodedArgs),
      );
      return yield* Schema.decode(function_.returns)(encodedReturns);
    });

export const MutationRunner = Context.GenericTag<
  ReturnType<typeof makeMutationRunner>
>("@rjdellecese/confect/server/MutationRunner");
export type MutationRunner = typeof MutationRunner.Identifier;

export const layer = (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  Layer.succeed(MutationRunner, makeMutationRunner(runMutation));

export class MutationRollback extends Schema.TaggedError<MutationRollback>(
  "MutationRollback",
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
