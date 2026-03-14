import * as Ref from "@confect/core/Ref";
import { type GenericMutationCtx } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Match, Schema } from "effect";

const make =
  (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  <Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    args: Ref.Args<Mutation>,
  ): Effect.Effect<Ref.Returns<Mutation>, ParseResult.ParseError> =>
    Effect.gen(function* () {
      const functionSpec = Ref.getFunctionSpec(mutation);
      const functionName = Ref.getConvexFunctionName(mutation);

      return yield* Match.value(functionSpec.functionProvenance).pipe(
        Match.tag("Confect", (confectFunctionSpec) =>
          Effect.gen(function* () {
            const encodedArgs = yield* Schema.encode(confectFunctionSpec.args)(
              args,
            );
            const encodedReturns = yield* Effect.promise(() =>
              runMutation(functionName as any, encodedArgs),
            );
            return yield* Schema.decode(confectFunctionSpec.returns)(
              encodedReturns,
            );
          }),
        ),
        Match.tag("Convex", () =>
          Effect.promise(() => runMutation(functionName as any, args as any)),
        ),
        Match.exhaustive,
      );
    });

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
