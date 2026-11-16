import * as Ref from "@confect/core/Ref";
import type { GenericActionCtx } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";
import * as MutationTransactionContext from "./MutationTransactionContext";

/**
 * Transaction limits for a nested mutation. Only mutation handlers may supply
 * these options; actions and HTTP handlers must omit the options argument.
 */
export type Options = MutationTransactionContext.MutationOptions;

const run = Effect.fn("MutationRunner.runMutation")(
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => effect,
);

const make = (nativeRunMutation: GenericActionCtx<any>["runMutation"]) => {
  /**
   * Invoke a mutation with decoded arguments and no transaction overrides.
   *
   * @param mutation - Generated public or internal mutation ref.
   * @param args - Decoded arguments, optional for an argument-free ref.
   *
   * @returns An Effect with decoded results and declared failures or
   *   SchemaError. Native/undeclared failures become defects.
   */
  function runMutation<Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    ...args: [...Ref.OptionalArgs<Mutation>, options?: undefined]
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | Schema.SchemaError
  >;
  /**
   * Invoke a nested mutation with transaction limits from a mutation context.
   *
   * @param mutation - Generated mutation ref.
   * @param args - Decoded arguments; pass {} when no arguments are declared.
   * @param options - Limits for the nested call, capped by Convex's limits.
   *
   * @returns An Effect with decoded results and declared/schema failures.
   */
  function runMutation<Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    args: Ref.Args<Mutation>,
    options: Options | undefined,
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | Schema.SchemaError,
    MutationTransactionContext.MutationTransactionContext
  >;
  function runMutation<Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    args?: Ref.Args<Mutation>,
    options?: Options,
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | Schema.SchemaError,
    MutationTransactionContext.MutationTransactionContext
  > {
    return run(
      Effect.gen(function* () {
        const actualArgs = (args ?? {}) as Ref.Args<Mutation>;
        if (options !== undefined) {
          const controls =
            yield* MutationTransactionContext.MutationTransactionContext;
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
  return {
    /**
     * Invoke a generated mutation ref with decoded arguments.
     *
     * @param mutation - Public or internal mutation ref.
     * @param args - Decoded arguments; omit for an argument-free ref, or pass
     *   {} before an options argument.
     * @param options - Nested transactionLimits, available only in mutations.
     *   Omit options when invoking from actions or HTTP handlers.
     *
     * @returns An Effect producing the decoded result. Declared errors and
     *   SchemaError are typed failures; native/undeclared failures are
     *   defects.
     */
    runMutation,
  };
};

/**
 * Mutation invocation service available in mutations, actions and HTTP
 * handlers. Yield the generated `MutationRunner` tag and use its `runMutation`
 * method.
 */
export const MutationRunner =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/server/MutationRunner");
/**
 * Effect requirement identifier for the generated mutation invocation service.
 */
export type MutationRunner = typeof MutationRunner.Identifier;

/**
 * @internal
 */
export const layer = (runMutation: GenericActionCtx<any>["runMutation"]) =>
  Layer.succeed(MutationRunner, make(runMutation));
