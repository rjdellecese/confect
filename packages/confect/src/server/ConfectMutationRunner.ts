import { type GenericMutationCtx } from "convex/server";
import { Context, Effect, Layer, Schema } from "effect";
import * as ConfectApiRefs from "../api/ConfectApiRefs";

const makeMutationRunner =
  (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  <Mutation extends ConfectApiRefs.Ref.AnyMutation>(
    mutation: Mutation,
    args: ConfectApiRefs.Ref.Args<Mutation>["Type"],
  ) =>
    Effect.gen(function* () {
      const function_ = ConfectApiRefs.getFunction(mutation);
      const functionName = ConfectApiRefs.getConvexFunctionName(mutation);

      const encodedArgs = yield* Schema.encode(function_.args)(args);
      const encodedReturns = yield* Effect.promise(() =>
        runMutation(functionName as any, encodedArgs),
      );
      return yield* Schema.decode(function_.returns)(encodedReturns);
    });

export const ConfectMutationRunner = Context.GenericTag<
  ReturnType<typeof makeMutationRunner>
>("@rjdellecese/confect/server/ConfectMutationRunner");
export type ConfectMutationRunner = typeof ConfectMutationRunner.Identifier;

export const layer = (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  Layer.succeed(ConfectMutationRunner, makeMutationRunner(runMutation));

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
