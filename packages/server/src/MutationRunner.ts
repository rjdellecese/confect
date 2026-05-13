import * as Ref from "@confect/core/Ref";
import { type GenericMutationCtx } from "convex/server";
import type { ParseResult, Effect } from "effect";
import { Context, Layer } from "effect";

const make =
  (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  <Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    ...args: Ref.OptionalArgs<Mutation>
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | ParseResult.ParseError
  > =>
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
