import * as Ref from "@confect/core/Ref";
import type { GenericActionCtx } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";
import * as MutationTransactionControls from "./MutationTransactionControls";

export type Options = MutationTransactionControls.MutationOptions;

const run = Effect.fn("MutationRunner.runMutation")(
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => effect,
);

const make = (nativeRunMutation: GenericActionCtx<any>["runMutation"]) => {
  function runMutation<Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    ...args: [...Ref.OptionalArgs<Mutation>, options?: undefined]
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | Schema.SchemaError
  >;
  function runMutation<Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    args: Ref.Args<Mutation>,
    options: Options | undefined,
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | Schema.SchemaError,
    MutationTransactionControls.MutationTransactionControls
  >;
  function runMutation<Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    args?: Ref.Args<Mutation>,
    options?: Options,
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | Schema.SchemaError,
    MutationTransactionControls.MutationTransactionControls
  > {
    return run(
      Effect.gen(function* () {
        const actualArgs = (args ?? {}) as Ref.Args<Mutation>;
        if (options !== undefined) {
          const controls =
            yield* MutationTransactionControls.MutationTransactionControls;
          return yield* controls.runMutation(mutation, actualArgs, options);
        }
        return yield* Ref.runWithCodec(
          mutation,
          actualArgs,
          (ref, encodedArgs) => nativeRunMutation(ref, encodedArgs),
        );
      }),
    );
  }
  return { runMutation };
};

export const MutationRunner = Context.Service<ReturnType<typeof make>>(
  "@confect/server/MutationRunner",
);
export type MutationRunner = typeof MutationRunner.Identifier;

export const layer = (runMutation: GenericActionCtx<any>["runMutation"]) =>
  Layer.succeed(MutationRunner, make(runMutation));
