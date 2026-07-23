import * as Ref from "@confect/core/Ref";
import { type GenericActionCtx } from "convex/server";
import type { Effect } from "effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";

const make =
  (runMutation: GenericActionCtx<any>["runMutation"]) =>
  <Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    ...args: Ref.OptionalArgs<Mutation>
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | Schema.SchemaError
  > =>
    Ref.runWithCodec(
      mutation,
      (args[0] ?? {}) as Ref.Args<Mutation>,
      (functionReference, encodedArgs) =>
        runMutation(functionReference, encodedArgs),
    );

export const MutationRunner = Context.Service<ReturnType<typeof make>>(
  "@confect/server/MutationRunner",
);
export type MutationRunner = typeof MutationRunner.Identifier;

export const layer = (runMutation: GenericActionCtx<any>["runMutation"]) =>
  Layer.succeed(MutationRunner, make(runMutation));

export const context = (runMutation: GenericActionCtx<any>["runMutation"]) =>
  Context.make(MutationRunner, make(runMutation));
