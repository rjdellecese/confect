import * as Ref from "@confect/core/Ref";
import { type GenericMutationCtx } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Schema } from "effect";

const makeMutationRunner =
  (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  <Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    args: Ref.Args<Mutation>["Type"],
  ): Effect.Effect<Ref.Returns<Mutation>["Type"], ParseResult.ParseError> =>
    Effect.gen(function* () {
      const function_ = Ref.getFunction(mutation);
      const functionName = Ref.getConvexFunctionName(mutation);

      const encodedArgs = yield* Schema.encode(function_.args)(args);
      const encodedReturns = yield* Effect.promise(() =>
        runMutation(functionName as any, encodedArgs),
      );
      return yield* Schema.decode(function_.returns)(encodedReturns);
    });

export const MutationRunner = Context.GenericTag<
  ReturnType<typeof makeMutationRunner>
>("@confect/server/MutationRunner");
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
