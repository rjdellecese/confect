import type { FunctionType, FunctionVisibility } from "convex/server";
import type * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import type * as Schema from "effect/Schema";
import type { unhandled } from "effect/Types";
import type * as FunctionProvenance from "./FunctionProvenance";
import type * as FunctionSpec from "./FunctionSpec";
import * as Lazy from "./Lazy";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

export const TypeId = "@confect/core/MiddlewareSpec";
export type TypeId = typeof TypeId;

export const isMiddlewareSpec = (u: unknown): u is AnyMiddlewareSpec =>
  Predicate.hasProperty(u, TypeId);

export const allFunctionTypes: ReadonlyArray<FunctionType> = [
  "query",
  "mutation",
  "action",
];

export interface SupportedFunctionTypes {
  readonly query: boolean;
  readonly mutation: boolean;
  readonly action: boolean;
}

/**
 * Marker success type used by middleware to represent the handler's outcome
 * without exposing its concrete success value.
 *
 * Mirrors `RpcMiddleware.SuccessValue` in Effect.
 */
export interface SuccessValue {
  readonly _: unique symbol;
}

/**
 * The wrap-style middleware implementation shape: receives the downstream
 * effect (the remaining middleware plus the function handler) and the
 * covered invocation's metadata, and returns the effect that runs in its
 * place.
 *
 * Mirrors `RpcMiddleware.RpcMiddleware` in Effect.
 */
export interface MiddlewareImpl<Provides_, E, R> {
  (
    effect: Effect.Effect<SuccessValue, E | unhandled, Provides_>,
    options: MiddlewareOptions,
  ): Effect.Effect<SuccessValue, E | unhandled, R>;
}

export interface MiddlewareOptions {
  readonly name: string;
  readonly functionType: FunctionType;
  readonly functionVisibility: FunctionVisibility;
  readonly args: unknown;
}

export interface AnyMiddlewareImpl extends MiddlewareImpl<any, any, any> {}

/**
 * The class shape produced by {@link MiddlewareSpec}. Only the static side is ever
 * used — the class is a value-level carrier for the middleware's key, its
 * declared functionTypes, and its (lazily-evaluated) error schema, plus the
 * type-level `Provides`/`Error` metadata. It is deliberately not a
 * `Context.Tag`: implementations are registered through the group `Registry`
 * (like `FunctionImpl`s), not resolved from a Layer context.
 */
export interface MiddlewareSpec<
  in out Self,
  Key_ extends string,
  Provides_,
  Requires_,
  ErrorSchema_ extends Schema.Codec<any, any>,
  FunctionTypes_ extends FunctionType,
> {
  new (_: never): {
    readonly [TypeId]: TypeId;
    readonly key: Key_;
  };
  readonly [TypeId]: TypeId;
  readonly key: Key_;
  readonly functionTypes: SupportedFunctionTypes;
  readonly error?: ErrorSchema_;
  readonly "~Provides": Provides_;
  readonly "~Requires": Requires_;
  readonly "~Error": ErrorSchema_;
  readonly "~FunctionTypes": FunctionTypes_;
  readonly "~Self": Self;
}

export interface AnyMiddlewareSpec {
  readonly [TypeId]: TypeId;
  readonly key: string;
  readonly functionTypes: SupportedFunctionTypes;
  readonly error?: Schema.Codec<any, any>;
  readonly "~Provides": any;
  readonly "~Requires": any;
  readonly "~Error": any;
  readonly "~FunctionTypes": FunctionType;
}

export type Key<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_["key"];

export type Provides<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~Provides"]
    : never;

/**
 * The services a middleware's implementation may consume from middleware
 * that runs earlier in the same chain (type-level only, like `provides`).
 */
export type Requires<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~Requires"]
    : never;

export type ErrorSchema<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec ? MiddlewareSpec_["~Error"] : never;

export type Error<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~Error"]["Type"]
    : never;

export type EncodedError<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~Error"]["Encoded"]
    : never;

export type FunctionTypes<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~FunctionTypes"]
    : never;

/**
 * Declare a middleware's client-safe interface: its identifying key, the
 * service it provides to downstream handlers, the error schema its failures
 * encode through, and the function types it may attach to.
 *
 * ```ts
 * class RequireUser extends MiddlewareSpec.MiddlewareSpec<RequireUser, {
 *   provides: CurrentUser
 * }>()("RequireUser", {
 *   error: () => NotSignedIn,
 *   functionTypes: { query: true, mutation: true, action: false },
 * }) {}
 * ```
 *
 * The implementation is server-only and supplied separately via
 * `MiddlewareImpl.make` (or `makeByFunctionType`/`provides`) in `@confect/server`.
 */
export const MiddlewareSpec =
  <Self, Config extends { provides?: any; requires?: any } = {}>() =>
  <
    const Key_ extends string,
    const FunctionTypesConfig_ extends SupportedFunctionTypes,
    ErrorSchema_ extends Schema.Codec<any, any> = never,
  >(
    key: Key_,
    options: {
      readonly error?: () => ErrorSchema_;
      readonly functionTypes: FunctionTypesConfig_ &
        ValidateFunctionTypesConfig<FunctionTypesConfig_>;
    },
  ): MiddlewareSpec<
    Self,
    Key_,
    "provides" extends keyof Config ? Config["provides"] : never,
    "requires" extends keyof Config ? Config["requires"] : never,
    ErrorSchema_,
    FunctionTypesFromConfig<FunctionTypesConfig_>
  > => {
    const { query, mutation, action } = options.functionTypes;
    if (!query && !mutation && !action) {
      throw new Error(
        `Middleware "${key}" must declare at least one function type`,
      );
    }

    function MiddlewareSpecClass() {}
    const class_ = MiddlewareSpecClass as any;
    class_[TypeId] = TypeId;
    class_.key = key;
    class_.functionTypes = {
      query,
      mutation,
      action,
    } satisfies SupportedFunctionTypes;
    if (options.error !== undefined) {
      Lazy.defineProperty(class_, "error", options.error);
    }
    return class_;
  };

type FunctionTypesFromConfig<Config extends SupportedFunctionTypes> = {
  [K in FunctionType]: Config[K] extends true ? K : never;
}[FunctionType];

type ValidateFunctionTypesConfig<Config extends SupportedFunctionTypes> =
  ValidationResult<
    | {
        [K in keyof Config]: boolean extends Config[K]
          ? AttachmentError<`Function type flag "${K & string}" must be a literal \`true\` or \`false\`, not a computed \`boolean\``>
          : never;
      }[keyof Config]
    | ([FunctionTypesFromConfig<Config>] extends [never]
        ? AttachmentError<`A middleware must declare at least one function type`>
        : never)
  >;

export const errorSchemas = (
  middlewareSpecs: ReadonlyArray<AnyMiddlewareSpec>,
): ReadonlyArray<Schema.Codec<any, any>> =>
  middlewareSpecs.flatMap((middlewareSpec) =>
    "error" in middlewareSpec && middlewareSpec.error !== undefined
      ? [middlewareSpec.error]
      : [],
  );

/**
 * A branded, unconstructible type carrying a spec-authoring error message.
 * Surfaced as (part of) a parameter type so the diagnostic names the exact
 * problem at the `.middleware()` / `.addFunction()` call site.
 */
export interface AttachmentError<Message extends string> {
  readonly "~confect/MiddlewareSpec/AttachmentError": Message;
}

type FunctionTypeOf<FunctionSpec_ extends FunctionSpec.AnyWithProps> =
  FunctionSpec_["runtimeAndFunctionType"]["functionType"];

type ValidationResult<Errors> = [Errors] extends [never] ? unknown : Errors;

/**
 * A matching-type Convex-provenance function is rejected rather than
 * silently skipped: its raw handler passes through Confect untouched, so
 * the middleware could not actually cover it, and skipping it would be a
 * policy hole.
 */
export type ValidateFunction<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  MiddlewareSpec_ extends AnyMiddlewareSpec,
> = FunctionSpec_ extends any
  ? MiddlewareSpec_ extends any
    ? FunctionSpec_ extends {
        readonly functionProvenance: { readonly _tag: "Convex" };
      }
      ? FunctionTypeOf<FunctionSpec_> extends FunctionTypes<MiddlewareSpec_>
        ? AttachmentError<`Convex-provenance function "${FunctionSpec_["name"]}" cannot be covered by middleware "${Key<MiddlewareSpec_>}" — attach middleware only to groups whose matching-type functions are all Confect-provenance`>
        : never
      : [
            Extract<
              FunctionSpec.MiddlewareSpecs<FunctionSpec_>,
              { readonly key: Key<MiddlewareSpec_> }
            >,
          ] extends [never]
        ? FunctionTypeOf<FunctionSpec_> extends FunctionTypes<MiddlewareSpec_>
          ? never
          : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" does not declare function type "${FunctionTypeOf<FunctionSpec_>}", the type of function "${FunctionSpec_["name"]}"`>
        : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" is already attached to function "${FunctionSpec_["name"]}"`>
    : never
  : never;

/**
 * Attachment order is chain order, so requiring `requires` to be satisfied
 * by already-attached middleware is exactly requiring the provider to run
 * earlier.
 */
export type ValidateAttach<
  MiddlewareSpec_ extends AnyMiddlewareSpec,
  Functions_ extends FunctionSpec.AnyWithProps,
  MiddlewareSpecs_ extends AnyMiddlewareSpec,
> = [
  Extract<MiddlewareSpecs_, { readonly key: Key<MiddlewareSpec_> }>,
] extends [never]
  ? [Exclude<Requires<MiddlewareSpec_>, Provides<MiddlewareSpecs_>>] extends [
      never,
    ]
    ? ValidationResult<ValidateFunction<Functions_, MiddlewareSpec_>>
    : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" requires services that no middleware attached earlier to this group provides — attach the providing middleware first`>
  : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" is already attached to this group`>;

export type ValidateAddedFunction<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  MiddlewareSpecs_ extends AnyMiddlewareSpec,
> = [MiddlewareSpecs_] extends [never]
  ? unknown
  : ValidationResult<
      | ValidateFunction<FunctionSpec_, MiddlewareSpecs_>
      | GroupOverlap<FunctionSpec_, MiddlewareSpecs_>
    >;

type GroupOverlap<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  MiddlewareSpecs_ extends AnyMiddlewareSpec,
> =
  FunctionSpec.MiddlewareSpecs<FunctionSpec_> extends infer FunctionMiddlewareSpec
    ? FunctionMiddlewareSpec extends AnyMiddlewareSpec
      ? [
          Extract<
            MiddlewareSpecs_,
            { readonly key: Key<FunctionMiddlewareSpec> }
          >,
        ] extends [never]
        ? never
        : AttachmentError<`Middleware "${Key<FunctionMiddlewareSpec>}" is attached to both function "${FunctionSpec_["name"]}" and its group`>
      : never
    : never;

/**
 * The parameter-type validation applied to the group spec at
 * `GroupImpl.make`: every function's attached middleware must have its
 * `requires` services provided by some middleware covering that function
 * (the group's or the function's own). Checked here — with the group fully
 * assembled — rather than at the spec builders, because a function-level
 * middleware's `requires` may legitimately be satisfied by a group
 * middleware the function spec never sees, and group attachment is
 * declaratively order-independent with respect to `addFunction`.
 */
export type ValidateImplRequires<
  Functions_ extends FunctionSpec.AnyWithProps,
  GroupMiddlewareSpecs_ extends AnyMiddlewareSpec,
> = ValidationResult<
  Functions_ extends any
    ? [
        Exclude<
          Requires<FunctionSpec.MiddlewareSpecs<Functions_>>,
          Provides<
            GroupMiddlewareSpecs_ | FunctionSpec.MiddlewareSpecs<Functions_>
          >
        >,
      ] extends [never]
      ? never
      : AttachmentError<`Function "${Functions_["name"]}" has middleware requiring services that no middleware covering it provides`>
    : never
>;

export type ValidateFunctionAttach<
  MiddlewareSpec_ extends AnyMiddlewareSpec,
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
  MiddlewareSpecs_ extends AnyMiddlewareSpec,
> = FunctionProvenance_ extends { readonly _tag: "Convex" }
  ? AttachmentError<`Plain Convex functions cannot have middleware — their raw handlers are passed through untouched`>
  : [
        Extract<MiddlewareSpecs_, { readonly key: Key<MiddlewareSpec_> }>,
      ] extends [never]
    ? RuntimeAndFunctionType_["functionType"] extends FunctionTypes<MiddlewareSpec_>
      ? unknown
      : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" does not declare function type "${RuntimeAndFunctionType_["functionType"]}"`>
    : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" is already attached to this function`>;
