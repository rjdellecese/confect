import * as Ref from "@confect/core/Ref";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";
import * as MutationTransactionContext from "./MutationTransactionContext";

/**
 * Resource limits for a mutation invoked from another mutation. They apply to
 * the nested call rather than the whole handler.
 *
 * **Gotchas**
 *
 * Actions and HTTP handlers must omit the options object, even when it is
 * empty.
 *
 * @category Configuration
 */
export type Options = MutationTransactionContext.MutationOptions;

const run = Effect.fn("MutationRunner.runMutation")(
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => effect,
);

const make = (
  nativeRunMutation: GenericActionCtx<GenericDataModel>["runMutation"],
) => {
  /**
   * Runs a mutation with decoded arguments and no transaction overrides,
   * including from an action or HTTP handler.
   *
   * @category Running
   *
   * @param mutation - Generated public or internal mutation ref.
   * @param args - Decoded arguments; omit for an argument-free ref.
   *
   * @returns An Effect producing the decoded result. Declared errors and
   *   `SchemaError` are typed failures; unexpected Convex failures are
   *   defects.
   */
  function runMutation<Mutation extends Ref.AnyMutation>(
    mutation: Mutation,
    ...args: [...Ref.OptionalArgs<Mutation>, options?: undefined]
  ): Effect.Effect<
    Ref.Returns<Mutation>,
    Ref.Error<Mutation> | Schema.SchemaError
  >;
  /**
   * Runs a nested mutation with resource limits set by the enclosing mutation.
   *
   * @category Running
   *
   * @param mutation - Generated public or internal mutation ref.
   * @param args - Decoded arguments; pass `{}` for an argument-free ref.
   * @param options - Limits for this call, capped by Convex's transaction
   *   limits.
   *
   * @returns An Effect producing the decoded result. Declared errors and
   *   `SchemaError` are typed failures; unexpected Convex failures are
   *   defects.
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
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The public overload permits omitted args only for a keyless ref. Its conditional tuple is no longer available beside the transaction options here.
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
     * Runs a generated mutation with decoded arguments and returns its decoded
     * result. Inside a mutation, pass `transactionLimits` to bound the nested
     * call.
     *
     * **Gotchas**
     *
     * In an action or HTTP handler, omit the options object rather than passing
     * `{}`.
     *
     * @category Running
     *
     * @param mutation - Generated public or internal mutation ref.
     * @param args - Decoded arguments; omit for an argument-free ref, or pass
     *   `{}` before options.
     * @param options - Resource limits for this nested mutation.
     *
     * @returns An Effect producing the decoded result. Declared errors and
     *   `SchemaError` are typed failures; unexpected Convex failures are
     *   defects.
     */
    runMutation,
  };
};

/**
 * Tag for running mutations from mutations, actions, and HTTP handlers. Yield
 * the generated `MutationRunner` tag and pass a mutation ref to `runMutation`.
 *
 * @category Tags
 */
export const MutationRunner =
  // oxlint-disable-next-line effecttsgo/service-not-as-class -- Preserve the public structural Identifier and Effect requirement types; class identifiers would change those contracts.
  Context.Service<ReturnType<typeof make>>("@confect/server/MutationRunner");
/**
 * Effect environment requirement for an operation that calls a mutation through
 * the generated `MutationRunner` service.
 *
 * @category Context
 */
export type MutationRunner = typeof MutationRunner.Identifier;

/**
 * @internal
 */
export const layer = (
  runMutation: GenericActionCtx<GenericDataModel>["runMutation"],
) => Layer.succeed(MutationRunner, make(runMutation));
