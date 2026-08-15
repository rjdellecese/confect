import type { FunctionType } from "convex/server";
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

export const isMiddlewareSpec = (u: unknown): u is AnyService =>
  Predicate.hasProperty(u, TypeId);

export type AllFunctionTypes = ["query", "mutation", "action"];

export const allFunctionTypes: AllFunctionTypes = [
  "query",
  "mutation",
  "action",
];

/**
 * Marker success type used by middleware to represent the handler's outcome
 * without exposing its concrete success value. A middleware implementation
 * can only obtain a `SuccessValue` by running the downstream effect, so it
 * cannot fabricate or alter the function's return value.
 *
 * Mirrors `RpcMiddleware.SuccessValue` in Effect.
 */
export interface SuccessValue {
  readonly _: unique symbol;
}

/**
 * The wrap-style middleware implementation shape.
 *
 * The downstream effect (remaining middleware plus the function handler)
 * arrives as `effect`; its environment carries `Provides`, so the type
 * checker forces the implementation to discharge the obligation with
 * `Effect.provideService` (or to never run `effect` at all — that is how a
 * middleware short-circuits, by returning `Effect.fail` with its declared
 * error instead). Handler errors the middleware does not declare flow
 * through as the branded `unhandled` type and cannot be absorbed.
 *
 * Mirrors `RpcMiddleware.RpcMiddleware` in Effect, with Confect's invocation
 * metadata: the function's spec and its decoded args.
 */
export interface Middleware<Provides_, E, R> {
  (
    effect: Effect.Effect<SuccessValue, E | unhandled, Provides_>,
    options: {
      readonly spec: FunctionSpec.AnyWithProps;
      readonly args: unknown;
    },
  ): Effect.Effect<SuccessValue, E | unhandled, R>;
}

export interface AnyMiddleware extends Middleware<any, any, any> {}

/**
 * The class shape produced by {@link Service}. Only the static side is ever
 * used — the class is a value-level carrier for the middleware's key, its
 * declared functionTypes, and its (lazily-evaluated) error schema, plus the
 * type-level `Provides`/`Error` metadata. It is deliberately not a
 * `Context.Tag`: implementations are registered through the group `Registry`
 * (like `FunctionImpl`s), not resolved from a Layer context.
 */
export interface ServiceClass<
  in out Self,
  Key_ extends string,
  Provides_,
  Requires_,
  ErrorSchema_ extends Schema.Codec<any, any>,
  FunctionTypes_ extends ReadonlyArray<FunctionType>,
> {
  new (_: never): {
    readonly [TypeId]: TypeId;
    readonly key: Key_;
  };
  readonly [TypeId]: TypeId;
  readonly key: Key_;
  readonly functionTypes: FunctionTypes_;
  /**
   * The declared error schema. Installed as a lazy memoised property only
   * when the `error` option was provided, so `"error" in middleware`
   * observes its presence without forcing the thunk.
   */
  readonly error?: ErrorSchema_;
  readonly "~Provides": Provides_;
  readonly "~Requires": Requires_;
  readonly "~Error": ErrorSchema_;
  readonly "~Self": Self;
}

export interface AnyService {
  readonly [TypeId]: TypeId;
  readonly key: string;
  readonly functionTypes: ReadonlyArray<FunctionType>;
  readonly error?: Schema.Codec<any, any>;
  readonly "~Provides": any;
  readonly "~Requires": any;
  readonly "~Error": any;
}

export type Key<M extends AnyService> = M["key"];

export type Provides<M extends AnyService> = M extends AnyService
  ? M["~Provides"]
  : never;

/**
 * The services a middleware's implementation may consume from middleware
 * that runs earlier in the same chain (type-level only, like `provides`).
 */
export type Requires<M extends AnyService> = M extends AnyService
  ? M["~Requires"]
  : never;

export type ErrorSchema<M extends AnyService> = M extends AnyService
  ? M["~Error"]
  : never;

export type Error<M extends AnyService> = M extends AnyService
  ? M["~Error"]["Type"]
  : never;

export type EncodedError<M extends AnyService> = M extends AnyService
  ? M["~Error"]["Encoded"]
  : never;

export type FunctionTypes<M extends AnyService> = M extends AnyService
  ? M["functionTypes"][number]
  : never;

/**
 * Declare a middleware's client-safe interface: its identifying key, the
 * service it provides to downstream handlers (type-level only, following
 * Effect v4's `RpcMiddleware.Service`), the error schema its failures encode
 * through, and the function functionTypes it may attach to.
 *
 * ```ts
 * class RequireUser extends MiddlewareSpec.Service<RequireUser, {
 *   provides: CurrentUser
 * }>()("RequireUser", {
 *   error: () => NotSignedIn,
 *   functionTypes: ["query", "mutation"],
 * }) {}
 * ```
 *
 * The implementation is server-only and supplied separately via
 * `MiddlewareImpl.make` (or `makeByFunctionType`/`provides`) in `@confect/server`.
 */
export const Service =
  <Self, Config extends { provides?: any; requires?: any } = {}>() =>
  <
    const Key_ extends string,
    ErrorSchema_ extends Schema.Codec<any, any> = never,
    const FunctionTypes_ extends ReadonlyArray<FunctionType> = AllFunctionTypes,
  >(
    key: Key_,
    options?: {
      /** Lazily-evaluated error schema, like `FunctionSpec`'s `error`. */
      readonly error?: () => ErrorSchema_;
      /**
       * Function functionTypes this middleware may attach to. Default: all three.
       * Node actions fall under `"action"`, so an `"action"` implementation
       * must be valid in both action runtimes — which is why that function type's
       * service bound excludes the Node-only services.
       */
      readonly functionTypes?: FunctionTypes_;
    },
  ): ServiceClass<
    Self,
    Key_,
    "provides" extends keyof Config ? Config["provides"] : never,
    "requires" extends keyof Config ? Config["requires"] : never,
    ErrorSchema_,
    FunctionTypes_
  > => {
    function MiddlewareService() {}
    const class_ = MiddlewareService as any;
    class_[TypeId] = TypeId;
    class_.key = key;
    class_.functionTypes = options?.functionTypes ?? allFunctionTypes;
    if (options?.error !== undefined) {
      Lazy.defineProperty(class_, "error", options.error);
    }
    return class_;
  };

/**
 * The error schemas contributed by a set of middleware, in no particular
 * order — presence-checked at runtime via the lazily-installed `error`
 * property.
 */
export const errorSchemas = (
  middlewares: ReadonlyArray<AnyService>,
): ReadonlyArray<Schema.Codec<any, any>> =>
  middlewares.flatMap((middleware) =>
    "error" in middleware && middleware.error !== undefined
      ? [middleware.error]
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

type FunctionTypeOf<F extends FunctionSpec.AnyWithProps> =
  F["runtimeAndFunctionType"]["functionType"];

type ValidationResult<Errors> = [Errors] extends [never] ? unknown : Errors;

/**
 * Validate one or more functions against one or more middleware
 * (distributing over both unions):
 *
 * - A Convex-provenance function whose function type is among the middleware's
 *   declared `functionTypes` is rejected — its raw handler is passed through
 *   untouched, so the middleware could not actually cover it, and silently
 *   skipping it would be a policy hole. (One whose function type is *not* declared is
 *   fine: the middleware makes no claim about it.)
 * - A Confect-provenance function whose function type the middleware does not declare
 *   is rejected — every covered function's type must be among the
 *   middleware's `functionTypes`.
 */
export type ValidateFunction<
  F extends FunctionSpec.AnyWithProps,
  M extends AnyService,
> = F extends any
  ? M extends any
    ? F extends { readonly functionProvenance: { readonly _tag: "Convex" } }
      ? FunctionTypeOf<F> extends FunctionTypes<M>
        ? AttachmentError<`Convex-provenance function "${F["name"]}" cannot be covered by middleware "${Key<M>}" — attach middleware only to groups whose matching-type functions are all Confect-provenance`>
        : never
      : [
            Extract<FunctionSpec.Middlewares<F>, { readonly key: Key<M> }>,
          ] extends [never]
        ? FunctionTypeOf<F> extends FunctionTypes<M>
          ? never
          : AttachmentError<`Middleware "${Key<M>}" does not declare function type "${FunctionTypeOf<F>}", the type of function "${F["name"]}"`>
        : AttachmentError<`Middleware "${Key<M>}" is already attached to function "${F["name"]}"`>
    : never
  : never;

/**
 * The parameter-type validation applied by `GroupSpec.middleware`:
 * rejects a duplicate attachment (same key), requires the middleware's
 * `requires` services to be provided by middleware attached to the group
 * earlier (attachment order is chain order, so "already attached" is
 * exactly "runs earlier"), then validates every function already declared
 * on the group against the incoming middleware. Resolves to `unknown` when
 * the attachment is legal, so intersecting with the middleware type is a
 * no-op.
 */
export type ValidateAttach<
  M extends AnyService,
  Functions_ extends FunctionSpec.AnyWithProps,
  Middlewares_ extends AnyService,
> = [Extract<Middlewares_, { readonly key: Key<M> }>] extends [never]
  ? [Exclude<Requires<M>, Provides<Middlewares_>>] extends [never]
    ? ValidationResult<ValidateFunction<Functions_, M>>
    : AttachmentError<`Middleware "${Key<M>}" requires services that no middleware attached earlier to this group provides — attach the providing middleware first`>
  : AttachmentError<`Middleware "${Key<M>}" is already attached to this group`>;

/**
 * The parameter-type validation applied by `GroupSpec.addFunction` once a
 * group carries middleware: the incoming function must be valid against
 * every attached middleware (the declarative group-attachment semantics are
 * order-independent, so functions added after `.middleware()` are checked
 * just like ones added before), and none of the function's own middleware
 * may duplicate a group-attached one.
 */
export type ValidateAddedFunction<
  F extends FunctionSpec.AnyWithProps,
  Middlewares_ extends AnyService,
> = [Middlewares_] extends [never]
  ? unknown
  : ValidationResult<
      ValidateFunction<F, Middlewares_> | GroupOverlap<F, Middlewares_>
    >;

type GroupOverlap<
  F extends FunctionSpec.AnyWithProps,
  Middlewares_ extends AnyService,
> =
  FunctionSpec.Middlewares<F> extends infer FunctionMiddleware
    ? FunctionMiddleware extends AnyService
      ? [
          Extract<Middlewares_, { readonly key: Key<FunctionMiddleware> }>,
        ] extends [never]
        ? never
        : AttachmentError<`Middleware "${Key<FunctionMiddleware>}" is attached to both function "${F["name"]}" and its group`>
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
 *
 * This check is order-insensitive within a single function's own middleware
 * list (`provides` has no runtime representation to check against);
 * attaching a function-level middleware before its same-level provider
 * fails at runtime with a missing-service defect.
 */
export type ValidateImplRequires<
  Functions_ extends FunctionSpec.AnyWithProps,
  GroupMiddlewares_ extends AnyService,
> = ValidationResult<
  Functions_ extends any
    ? [
        Exclude<
          Requires<FunctionSpec.Middlewares<Functions_>>,
          Provides<GroupMiddlewares_ | FunctionSpec.Middlewares<Functions_>>
        >,
      ] extends [never]
      ? never
      : AttachmentError<`Function "${Functions_["name"]}" has middleware requiring services that no middleware covering it provides`>
    : never
>;

/**
 * The parameter-type validation applied by `FunctionSpec`'s `.middleware()`:
 * plain Convex functions cannot carry middleware, the middleware must
 * declare the function's type, and it must not already be attached to the
 * function.
 */
export type ValidateFunctionAttach<
  M extends AnyService,
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
  Middlewares_ extends AnyService,
> = FunctionProvenance_ extends { readonly _tag: "Convex" }
  ? AttachmentError<`Plain Convex functions cannot have middleware — their raw handlers are passed through untouched`>
  : [Extract<Middlewares_, { readonly key: Key<M> }>] extends [never]
    ? RuntimeAndFunctionType_["functionType"] extends FunctionTypes<M>
      ? unknown
      : AttachmentError<`Middleware "${Key<M>}" does not declare function type "${RuntimeAndFunctionType_["functionType"]}"`>
    : AttachmentError<`Middleware "${Key<M>}" is already attached to this function`>;
