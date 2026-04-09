import type {
  FunctionReference as ConvexFunctionReference,
  FunctionVisibility,
} from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { ParseResult } from "effect";
import { Effect, Match, Schema } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

export interface Ref<
  _RuntimeAndFunctionType extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  _FunctionVisibility extends FunctionVisibility,
  _Args,
  _Returns,
> {
  readonly _RuntimeAndFunctionType?: _RuntimeAndFunctionType;
  readonly _FunctionVisibility?: _FunctionVisibility;
  readonly _Args?: _Args;
  readonly _Returns?: _Returns;
  /** @internal */
  readonly functionSpec: FunctionSpec.AnyWithProps;
  /** @internal */
  readonly functionNamespace: string;
}

export interface Any extends Ref<any, any, any, any> {}

export interface AnyInternal extends Ref<any, "internal", any, any> {}

export interface AnyPublic extends Ref<any, "public", any, any> {}

export interface AnyQuery extends Ref<
  RuntimeAndFunctionType.AnyQuery,
  FunctionVisibility,
  any,
  any
> {}

export interface AnyMutation extends Ref<
  RuntimeAndFunctionType.AnyMutation,
  FunctionVisibility,
  any,
  any
> {}

export interface AnyAction extends Ref<
  RuntimeAndFunctionType.AnyAction,
  FunctionVisibility,
  any,
  any
> {}

export interface AnyPublicQuery extends Ref<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  any,
  any
> {}

export interface AnyPublicMutation extends Ref<
  RuntimeAndFunctionType.AnyMutation,
  "public",
  any,
  any
> {}

export interface AnyPublicAction extends Ref<
  RuntimeAndFunctionType.AnyAction,
  "public",
  any,
  any
> {}

export type GetRuntimeAndFunctionType<Ref_> =
  Ref_ extends Ref<
    infer RuntimeAndFunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? RuntimeAndFunctionType_
    : never;

export type GetRuntime<Ref_> =
  Ref_ extends Ref<
    infer RuntimeAndFunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? RuntimeAndFunctionType.GetRuntime<RuntimeAndFunctionType_>
    : never;

export type GetFunctionType<Ref_> =
  Ref_ extends Ref<
    infer RuntimeAndFunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? RuntimeAndFunctionType.GetFunctionType<RuntimeAndFunctionType_>
    : never;

export type GetFunctionVisibility<Ref_> =
  Ref_ extends Ref<
    infer _RuntimeAndFunctionType,
    infer FunctionVisibility_,
    infer _Args,
    infer _Returns
  >
    ? FunctionVisibility_
    : never;

export type Args<Ref_> =
  Ref_ extends Ref<
    infer _RuntimeAndFunctionType,
    infer _FunctionVisibility,
    infer Args_,
    infer _Returns
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
    infer Returns_
  >
    ? Returns_
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
    FunctionSpec.Returns<FunctionSpec_>
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

export const encodeArgs = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): Effect.Effect<unknown, ParseResult.ParseError> =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (c) => Schema.encode(c.args)(args)),
    Match.tag("Convex", () => Effect.succeed(args)),
    Match.exhaustive,
  );

export const decodeReturns = <Ref_ extends Any>(
  ref: Ref_,
  returns: unknown,
): Effect.Effect<Returns<Ref_>, ParseResult.ParseError> =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (c) => Schema.decode(c.returns)(returns)),
    Match.tag("Convex", () => Effect.succeed(returns)),
    Match.exhaustive,
  );

export const encodeArgsSync = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): unknown =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (c) => Schema.encodeSync(c.args)(args)),
    Match.tag("Convex", () => args),
    Match.exhaustive,
  );

export const decodeReturnsSync = <Ref_ extends Any>(
  ref: Ref_,
  encodedReturns: unknown,
): Returns<Ref_> =>
  Match.value(ref.functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (c) => Schema.decodeSync(c.returns)(encodedReturns)),
    Match.tag("Convex", () => encodedReturns),
    Match.exhaustive,
  ) as Returns<Ref_>;

export const runWithCodec: {
  <Ref_ extends Any, E>(
    ref: Ref_,
    args: Args<Ref_>,
    f: (
      functionReference: FunctionReference<Ref_>,
      encodedArgs: unknown,
    ) => Effect.Effect<unknown, E>,
  ): Effect.Effect<Returns<Ref_>, E | ParseResult.ParseError>;
  <Ref_ extends Any>(
    ref: Ref_,
    args: Args<Ref_>,
    f: (
      functionReference: FunctionReference<Ref_>,
      encodedArgs: unknown,
    ) => PromiseLike<unknown>,
  ): Effect.Effect<Returns<Ref_>, ParseResult.ParseError>;
} = <Ref_ extends Any, E>(
  ref: Ref_,
  args: Args<Ref_>,
  f: (
    functionReference: FunctionReference<Ref_>,
    encodedArgs: unknown,
  ) => Effect.Effect<unknown, E> | PromiseLike<unknown>,
): Effect.Effect<Returns<Ref_>, E | ParseResult.ParseError> =>
  Effect.gen(function* () {
    const functionReference = getFunctionReference(ref);
    const functionProvenance = ref.functionSpec.functionProvenance;
    const call = (encodedArgs: unknown) => {
      const result = f(functionReference, encodedArgs);
      return Effect.isEffect(result) ? result : Effect.promise(() => result);
    };
    return yield* Match.value(functionProvenance).pipe(
      Match.tag("Confect", (confect) =>
        Effect.gen(function* () {
          const encodedArgs = yield* Schema.encode(confect.args)(args);
          const encodedReturns = yield* call(encodedArgs);
          return yield* Schema.decode(confect.returns)(encodedReturns);
        }),
      ),
      Match.tag("Convex", () => call(args)),
      Match.exhaustive,
    );
  });
