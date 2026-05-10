import type {
  FunctionReference as ConvexFunctionReference,
  FunctionVisibility,
} from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { Value } from "convex/values";
import { ConvexError } from "convex/values";
import type { ParseResult } from "effect";
import { Effect, Match, Option, Schema } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

export interface Ref<
  _RuntimeAndFunctionType extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  _FunctionVisibility extends FunctionVisibility,
  _Args,
  _Returns,
  _Error = never,
> {
  readonly _RuntimeAndFunctionType?: _RuntimeAndFunctionType;
  readonly _FunctionVisibility?: _FunctionVisibility;
  readonly _Args?: _Args;
  readonly _Returns?: _Returns;
  readonly _Error?: _Error;
  /** @internal */
  readonly functionSpec: FunctionSpec.AnyWithProps;
  /** @internal */
  readonly functionNamespace: string;
}

export interface Any extends Ref<any, any, any, any, any> {}

export interface AnyInternal extends Ref<any, "internal", any, any, any> {}

export interface AnyPublic extends Ref<any, "public", any, any, any> {}

export interface AnyQuery extends Ref<
  RuntimeAndFunctionType.AnyQuery,
  FunctionVisibility,
  any,
  any,
  any
> {}

export interface AnyMutation extends Ref<
  RuntimeAndFunctionType.AnyMutation,
  FunctionVisibility,
  any,
  any,
  any
> {}

export interface AnyAction extends Ref<
  RuntimeAndFunctionType.AnyAction,
  FunctionVisibility,
  any,
  any,
  any
> {}

export interface AnyPublicQuery extends Ref<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  any,
  any,
  any
> {}

export interface AnyPublicMutation extends Ref<
  RuntimeAndFunctionType.AnyMutation,
  "public",
  any,
  any,
  any
> {}

export interface AnyPublicAction extends Ref<
  RuntimeAndFunctionType.AnyAction,
  "public",
  any,
  any,
  any
> {}

export type GetRuntimeAndFunctionType<Ref_> =
  Ref_ extends Ref<
    infer RuntimeAndFunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns,
    infer _Error
  >
    ? RuntimeAndFunctionType_
    : never;

export type GetRuntime<Ref_> =
  Ref_ extends Ref<
    infer RuntimeAndFunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns,
    infer _Error
  >
    ? RuntimeAndFunctionType.GetRuntime<RuntimeAndFunctionType_>
    : never;

export type GetFunctionType<Ref_> =
  Ref_ extends Ref<
    infer RuntimeAndFunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns,
    infer _Error
  >
    ? RuntimeAndFunctionType.GetFunctionType<RuntimeAndFunctionType_>
    : never;

export type GetFunctionVisibility<Ref_> =
  Ref_ extends Ref<
    infer _RuntimeAndFunctionType,
    infer FunctionVisibility_,
    infer _Args,
    infer _Returns,
    infer _Error
  >
    ? FunctionVisibility_
    : never;

export type Args<Ref_> =
  Ref_ extends Ref<
    infer _RuntimeAndFunctionType,
    infer _FunctionVisibility,
    infer Args_,
    infer _Returns,
    infer _Error
  >
    ? Args_
    : never;

export type OptionalArgs<Ref_ extends Any> = keyof Args<Ref_> extends never
  ? [args?: Args<Ref_>]
  : [args: Args<Ref_>];

export type Returns<Ref_> =
  Ref_ extends Ref<
    infer _RuntimeAndFunctionType,
    infer _FunctionVisibility,
    infer _Args,
    infer Returns_,
    infer _Error
  >
    ? Returns_
    : never;

export type Error<Ref_> =
  Ref_ extends Ref<
    infer _RuntimeAndFunctionType,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns,
    infer Error_
  >
    ? Error_
    : never;

export type FunctionReference<Ref_ extends Any> = ConvexFunctionReference<
  GetFunctionType<Ref_>,
  GetFunctionVisibility<Ref_>
>;

export type FromFunctionSpec<FunctionSpec_ extends FunctionSpec.AnyWithProps> =
  Ref<
    FunctionSpec.GetRuntimeAndFunctionType<FunctionSpec_>,
    FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
    FunctionSpec.Args<FunctionSpec_>,
    FunctionSpec.Returns<FunctionSpec_>,
    FunctionSpec.Error<FunctionSpec_>
  >;

export const make = <FunctionSpec_ extends FunctionSpec.AnyWithProps>(
  /**
   * The namespace portion of a Convex function name, i.e. the part before the
   * colon. For example, for `myGroupDir/myGroupMod:myFunc` this would be
   * `myGroupDir/myGroupMod`.
   */
  functionNamespace: string,
  functionSpec: FunctionSpec_,
): FromFunctionSpec<FunctionSpec_> => ({ functionSpec, functionNamespace });

export const getConvexFunctionName = (ref: Any): string =>
  `${ref.functionNamespace}:${ref.functionSpec.name}`;

export const getFunctionReference = <Ref_ extends Any>(
  ref: Ref_,
): FunctionReference<Ref_> =>
  makeFunctionReference(getConvexFunctionName(ref)) as FunctionReference<Ref_>;

export const hasErrorSchema = (ref: Any): boolean =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag(
      "Confect",
      (confectFunctionProvenance) =>
        confectFunctionProvenance.error !== undefined,
    ),
    Match.tag("Convex", () => false),
    Match.exhaustive,
  );

export const encodeArgs = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): Effect.Effect<unknown, ParseResult.ParseError> =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (confectFunctionProvenance) =>
      Schema.encode(confectFunctionProvenance.args)(args),
    ),
    Match.tag("Convex", () => Effect.succeed(args)),
    Match.exhaustive,
  );

export const decodeReturns = <Ref_ extends Any>(
  ref: Ref_,
  returns: unknown,
): Effect.Effect<Returns<Ref_>, ParseResult.ParseError> =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (confectFunctionProvenance) =>
      Schema.decode(confectFunctionProvenance.returns)(returns),
    ),
    Match.tag("Convex", () => Effect.succeed(returns)),
    Match.exhaustive,
  );

export const encodeArgsSync = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): unknown =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (confectFunctionProvenance) =>
      Schema.encodeSync(confectFunctionProvenance.args)(args),
    ),
    Match.tag("Convex", () => args),
    Match.exhaustive,
  );

export const decodeReturnsSync = <Ref_ extends Any>(
  ref: Ref_,
  encodedReturns: unknown,
): Returns<Ref_> =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (confectFunctionProvenance) =>
      Schema.decodeSync(confectFunctionProvenance.returns)(encodedReturns),
    ),
    Match.tag("Convex", () => encodedReturns),
    Match.exhaustive,
  ) as Returns<Ref_>;

const ConvexErrorIdentifier = Symbol.for("ConvexError");

export const isConvexError = (error: unknown): error is ConvexError<Value> =>
  error instanceof ConvexError ||
  (typeof error === "object" &&
    error !== null &&
    ConvexErrorIdentifier in error);

/**
 * Build a callback-style handler that decodes the ref's typed error from a
 * caught `ConvexError`, or else forwards the value to `mapUnknownError`. The
 * fallback is also invoked when the input *is* a `ConvexError` but the ref
 * doesn't declare a typed-error schema—by definition such a value falls
 * outside the ref's error contract. Useful when adapting non-Effect APIs (e.g.
 * emitter callbacks for streamed subscriptions) to the same error semantics
 * that `runWithCodec` provides.
 */
export const decodeErrorOrElse =
  <Ref_ extends Any, E>(ref: Ref_, mapUnknownError: (error: unknown) => E) =>
  (error: unknown): Error<Ref_> | E => {
    if (isConvexError(error)) {
      const decoded = decodeErrorSync(ref, error.data);
      if (Option.isSome(decoded)) {
        return decoded.value;
      }
    }
    return mapUnknownError(error);
  };

/**
 * Decode `encodedError` against the ref's error schema. Returns `None` if the
 * ref doesn't declare a typed error (Confect ref without an `error` schema, or
 * a Convex-provenance ref)—by definition there's nothing to decode the value
 * into, and the caller is responsible for deciding what to do (typically:
 * surface the original value as a defect).
 */
export const decodeError = <Ref_ extends Any>(
  ref: Ref_,
  encodedError: unknown,
): Effect.Effect<Option.Option<Error<Ref_>>, ParseResult.ParseError> =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (confectFunctionProvenance) =>
      confectFunctionProvenance.error !== undefined
        ? Effect.map(
            Schema.decode(confectFunctionProvenance.error)(encodedError),
            Option.some,
          )
        : Effect.succeed(Option.none<Error<Ref_>>()),
    ),
    Match.tag("Convex", () => Effect.succeed(Option.none<Error<Ref_>>())),
    Match.exhaustive,
  );

/**
 * Synchronous counterpart to `decodeError`. Throws on schema decode failure;
 * returns `None` when the ref doesn't declare a typed error.
 */
export const decodeErrorSync = <Ref_ extends Any>(
  ref: Ref_,
  encodedError: unknown,
): Option.Option<Error<Ref_>> =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (confectFunctionProvenance) =>
      confectFunctionProvenance.error !== undefined
        ? Option.some(
            Schema.decodeSync(confectFunctionProvenance.error)(
              encodedError,
            ) as Error<Ref_>,
          )
        : Option.none<Error<Ref_>>(),
    ),
    Match.tag("Convex", () => Option.none<Error<Ref_>>()),
    Match.exhaustive,
  );

export const maybeDecodeErrorSync = <Ref_ extends Any>(
  ref: Ref_,
  error: unknown,
): unknown =>
  isConvexError(error)
    ? Match.value(ref.functionSpec.functionProvenance).pipe(
        Match.tag("Confect", (confectFunctionProvenance) =>
          confectFunctionProvenance.error !== undefined
            ? Schema.decodeSync(confectFunctionProvenance.error)(error.data)
            : error,
        ),
        Match.tag("Convex", () => error),
        Match.exhaustive,
      )
    : error;

/**
 * Encode args via the ref's args schema, invoke `call`, decode returns via the
 * ref's returns schema, and translate any thrown `ConvexError` into the ref's
 * typed error. Anything else the Promise rejects with—network failures,
 * server-side runtime errors, validation failures, etc.—is passed to
 * `mapUnknownError` to be turned into a typed `E`, or surfaced as a defect when
 * no handler is provided.
 */
export const runWithCodec = <Ref_ extends Any, E = never>(
  ref: Ref_,
  args: Args<Ref_>,
  call: (
    functionReference: FunctionReference<Ref_>,
    encodedArgs: unknown,
  ) => PromiseLike<unknown>,
  mapUnknownError?: (error: unknown) => E,
): Effect.Effect<Returns<Ref_>, E | Error<Ref_> | ParseResult.ParseError> =>
  Effect.gen(function* () {
    const functionReference = getFunctionReference(ref);
    const functionProvenance = ref.functionSpec.functionProvenance;
    const invoke = (
      encodedArgs: unknown,
    ): Effect.Effect<unknown, Error<Ref_> | E> =>
      Effect.tryPromise({
        try: () => Promise.resolve(call(functionReference, encodedArgs)),
        catch: (error): Error<Ref_> | E => {
          if (isConvexError(error)) {
            const decoded = decodeErrorSync(ref, error.data);
            if (Option.isSome(decoded)) {
              return decoded.value;
            }
          }
          if (mapUnknownError !== undefined) {
            return mapUnknownError(error);
          }
          throw error;
        },
      });
    return yield* Match.value(functionProvenance).pipe(
      Match.tag("Confect", (confectFunctionProvenance) =>
        Effect.gen(function* () {
          const encodedArgs = yield* Schema.encode(
            confectFunctionProvenance.args,
          )(args);
          const encodedReturns = yield* invoke(encodedArgs);
          return yield* Schema.decode(confectFunctionProvenance.returns)(
            encodedReturns,
          );
        }),
      ),
      Match.tag("Convex", () => invoke(args)),
      Match.exhaustive,
    );
  });
