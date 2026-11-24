import * as Array from "effect/Array";
import type { FunctionType, FunctionVisibility } from "convex/server";
import type * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import type * as Schema from "effect/Schema";
import type { unhandled } from "effect/Types";
import type * as FunctionProvenance from "./FunctionProvenance";
import type * as FunctionSpec from "./FunctionSpec";
import * as Lazy from "./Lazy";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

/**
 * @internal
 */
export const TypeId = "~@confect/core/MiddlewareSpec";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export const isMiddlewareSpec = (u: unknown): u is AnyMiddlewareSpec =>
  Predicate.hasProperty(u, TypeId);

/**
 * @internal
 */
export const allFunctionTypes: ReadonlyArray<FunctionType> = [
  "query",
  "mutation",
  "action",
];

/**
 * The function kinds a middleware may cover. Supply all three flags as literal
 * `true` or `false`, with at least one enabled. A group attachment must cover
 * every function in that group; Node.js actions use the `action` flag.
 *
 * @category Configuration
 */
export interface SupportedFunctionTypes {
  /**
   * Whether the middleware may cover queries.
   *
   * @category Options
   */
  readonly query: boolean;
  /**
   * Whether the middleware may cover mutations.
   *
   * @category Options
   */
  readonly mutation: boolean;
  /**
   * Whether the middleware may cover actions in either runtime.
   *
   * @category Options
   */
  readonly action: boolean;
}

/**
 * Marker success type used by middleware to represent the handler's outcome
 * without exposing its concrete success value.
 *
 * Mirrors `RpcMiddleware.SuccessValue` in Effect.
 *
 * @internal
 */
export interface SuccessValue {
  readonly _: unique symbol;
}

/**
 * A middleware implementation that wraps the remaining middleware and function
 * handler. It receives the downstream effect and invocation metadata and
 * returns the effect to run in their place.
 *
 * **Details**
 *
 * Provide the downstream effect's `Provides_` services before running it, or
 * short-circuit with a declared failure. Preserve the downstream effect's
 * opaque success value and unhandled failures. `R` describes the services the
 * wrapper itself requires.
 *
 * @category Models
 */
export interface MiddlewareImpl<Provides_, E, R, Options_ = never> {
  /**
   * Wraps the remaining middleware and handler for one invocation.
   *
   * @category Models
   *
   * @param effect - The downstream middleware and handler, with an opaque
   *   result.
   * @param context - The decoded invocation and this attachment's options.
   *
   * @returns The replacement effect, preserving downstream success and
   *   failures.
   */
  (
    effect: Effect.Effect<SuccessValue, E | unhandled, Provides_>,
    context: MiddlewareOptions<Options_>,
  ): Effect.Effect<SuccessValue, E | unhandled, R>;
}

/**
 * The context passed to middleware for one function invocation. It contains
 * metadata about the function and its decoded arguments.
 *
 * **Gotchas**
 *
 * The `options` field is absent when the policy declares no options schema.
 * With a schema, the field is present even when its value is `undefined`.
 * Confect validates the supplied value against the schema's decoded type
 * without decoding or coercing it.
 *
 * @category Models
 *
 * @property options - This attachment's validated type-side value, present only
 *   when the middleware declares an options schema.
 */
export type MiddlewareOptions<Options_ = never> = {
  /**
   * Metadata for the function call being wrapped.
   *
   * @category Models
   */
  readonly invocation: {
    /**
     * The function's local spec name.
     *
     * @category Models
     */
    readonly name: string;
    /**
     * The invoked function's kind; Node.js actions also report `action`.
     *
     * @category Models
     */
    readonly functionType: FunctionType;
    /**
     * Whether the function is public or restricted to server-side calls.
     *
     * @category Models
     */
    readonly functionVisibility: FunctionVisibility;
    /**
     * Decoded handler arguments, typed as unknown because a policy may cover
     * many functions.
     *
     * @category Models
     */
    readonly args: unknown;
  };
} & ([Options_] extends [never] ? unknown : { readonly options: Options_ });

/**
 * @internal
 */
export interface AnyMiddlewareImpl {
  (
    // oxlint-disable-next-line typescript/no-explicit-any -- The registry accepts wrappers with different downstream errors and required services, checked for each MiddlewareImpl at registration.
    effect: Effect.Effect<SuccessValue, any, any>,
    context: MiddlewareOptions | MiddlewareOptions<unknown>,
    // oxlint-disable-next-line typescript/no-explicit-any -- This erased wrapper may add or provide services and fail with the spec’s declared error; only the enclosing function knows those channels.
  ): Effect.Effect<SuccessValue, any, any>;
}

/**
 * The static contract of a middleware declaration created with
 * {@link MiddlewareSpec}. The class carries the key, supported function kinds,
 * lazy failure and options schemas, and the types of services it provides and
 * requires.
 *
 * **Details**
 *
 * Pass the class itself when attaching middleware. It is not an Effect service
 * tag: register its implementation with the group rather than looking up the
 * declaration in the Effect context.
 *
 * @category Models
 */
export interface MiddlewareSpec<
  in out Self,
  Key_ extends string,
  Provides_,
  Requires_,
  ErrorSchema_ extends Schema.Codec<unknown>,
  FunctionTypes_ extends FunctionType,
  OptionsSchema_ extends Schema.Schema<unknown> = never,
> {
  /**
   * The subclass identity used in type parameters; do not instantiate
   * middleware specs.
   *
   * @category Models
   */
  new (_: never): {
    /**
     * Identifies the middleware's instance type.
     *
     * @category Models
     */
    readonly [TypeId]: TypeId;
    /**
     * The middleware key associated with this instance type.
     *
     * @category Models
     */
    readonly key: Key_;
  };
  /**
   * Identifies a middleware declaration.
   *
   * @category Models
   */
  readonly [TypeId]: TypeId;
  /**
   * The unique key shared by this declaration and its registered
   * implementation.
   *
   * @category Models
   */
  readonly key: Key_;
  /**
   * The function kinds this middleware may cover.
   *
   * @category Options
   */
  readonly functionTypes: SupportedFunctionTypes;
  /**
   * The lazy codec for declared middleware failures; absent when none is
   * declared.
   *
   * @category Schemas
   */
  readonly error?: ErrorSchema_;
  /**
   * The lazy schema used to validate attachment values and compare their
   * equivalence.
   *
   * @category Schemas
   */
  readonly options?: OptionsSchema_;
  /**
   * The type-only services provided downstream; not a runtime property.
   *
   * @category Models
   */
  readonly "~Provides": Provides_;
  /**
   * The type-only services required from earlier middleware; not a runtime
   * property.
   *
   * @category Models
   */
  readonly "~Requires": Requires_;
  /**
   * The declared error codec's type; not a runtime property.
   *
   * @category Models
   */
  readonly "~Error": ErrorSchema_;
  /**
   * The union of covered function kinds; not a runtime property.
   *
   * @category Models
   */
  readonly "~FunctionTypes": FunctionTypes_;
  /**
   * The middleware subclass identity; not a runtime property.
   *
   * @category Models
   */
  readonly "~Self": Self;
  /**
   * The attachment-options schema's type; not a runtime property.
   *
   * @category Models
   */
  readonly "~Options": OptionsSchema_;
}

/**
 * @internal
 */
export interface AnyMiddlewareSpec {
  readonly [TypeId]: TypeId;
  readonly key: string;
  readonly functionTypes: SupportedFunctionTypes;
  readonly error?: Schema.Codec<unknown>;
  readonly options?: Schema.Schema<unknown>;
  readonly "~Provides": unknown;
  readonly "~Requires": unknown;
  readonly "~Error": Schema.Codec<unknown>;
  readonly "~FunctionTypes": FunctionType;
  readonly "~Options": Schema.Schema<unknown>;
}

/**
 * @internal
 */
export type Options<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_["~Options"]["Type"];

/**
 * @internal
 */
export type WithoutOptions<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? [MiddlewareSpec_["~Options"]] extends [never]
      ? MiddlewareSpec_
      : never
    : never;

/**
 * @internal
 */
export type Key<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_["key"];

/**
 * @internal
 */
export type Provides<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~Provides"]
    : never;

/**
 * The services a middleware's implementation may consume from middleware that
 * runs earlier in the same chain (type-level only, like `provides`).
 *
 * @internal
 */
export type Requires<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~Requires"]
    : never;

/**
 * @internal
 */
export type ErrorSchema<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec ? MiddlewareSpec_["~Error"] : never;

/**
 * @internal
 */
export type Error<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~Error"]["Type"]
    : never;

/**
 * @internal
 */
export type EncodedError<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~Error"]["Encoded"]
    : never;

/**
 * @internal
 */
export type FunctionTypes<MiddlewareSpec_ extends AnyMiddlewareSpec> =
  MiddlewareSpec_ extends AnyMiddlewareSpec
    ? MiddlewareSpec_["~FunctionTypes"]
    : never;

/**
 * Declares a client-safe middleware policy by key, supported function kinds,
 * and optional failure and attachment-options schemas. Extend the returned
 * class to give the policy a distinct identity.
 *
 * **Details**
 *
 * Supply the server implementation separately through `MiddlewareImpl.make`,
 * `makeByFunctionType`, or `provides` from the application's
 * `_generated/server` module. The optional `Config.provides` and
 * `Config.requires` slots describe service types, not runtime service tags.
 *
 * **Example** (Declaring a signed-in user policy)
 *
 * ```ts
 * import { MiddlewareSpec } from "@confect/core";
 * import * as Context from "effect/Context";
 * import * as Schema from "effect/Schema";
 *
 * class CurrentUser extends Context.Service<
 *   CurrentUser,
 *   { name: string }
 * >()("CurrentUser") {}
 * class NotSignedIn extends Schema.TaggedError<NotSignedIn, unknown>()(
 *   "NotSignedIn",
 *   {},
 * ) {}
 *
 * class RequireUser extends MiddlewareSpec.MiddlewareSpec<
 *   RequireUser,
 *   {
 *     provides: CurrentUser;
 *   }
 * >()("RequireUser", {
 *   error: () => NotSignedIn,
 *   functionTypes: { query: true, mutation: true, action: false },
 * }) {}
 * ```
 *
 * @category Constructors
 *
 * @param key - A unique key identifying one declaration and implementation.
 * @param options - Client-safe schema factories and function coverage.
 * @param options.error - Optional lazy failure codec, requiring no services and
 *   encoding to a Convex value; its decoded errors join covered functions'
 *   errors.
 * @param options.options - Optional lazy attachment-options schema. Values are
 *   validated on its type side without decoding, and repeated attachments are
 *   compared with its equivalence. Keep values and schemas free of secrets.
 * @param options.functionTypes - Literal flags for query, mutation, and action;
 *   all flags are required and at least one must be true.
 *
 * @returns A class to extend for the declaration; schema factories stay lazy.
 *
 * @throws If no function kind is enabled.
 */
export const MiddlewareSpec =
  <
    Self,
    Config extends { provides?: unknown; requires?: unknown } = Record<
      never,
      never
    >,
  >() =>
  <
    const Key_ extends string,
    const FunctionTypesConfig_ extends SupportedFunctionTypes,
    ErrorSchema_ extends Schema.Codec<unknown> = never,
    OptionsSchema_ extends Schema.Schema<unknown> = never,
  >(
    key: Key_,
    options: {
      readonly error?: () => ErrorSchema_;
      readonly options?: () => OptionsSchema_;
      readonly functionTypes: FunctionTypesConfig_ &
        ValidateFunctionTypesConfig<FunctionTypesConfig_>;
    },
  ): MiddlewareSpec<
    Self,
    Key_,
    "provides" extends keyof Config ? Config["provides"] : never,
    "requires" extends keyof Config ? Config["requires"] : never,
    ErrorSchema_,
    FunctionTypesFromConfig<FunctionTypesConfig_>,
    OptionsSchema_
  > => {
    const { query, mutation, action } = options.functionTypes;
    if (!query && !mutation && !action) {
      throw new Error(
        `Middleware "${key}" must declare at least one function type`,
      );
    }

    class MiddlewareSpecClass {
      static readonly [TypeId]: TypeId = TypeId;
      static readonly key = key;
      static readonly functionTypes = { query, mutation, action };
      declare static readonly error?: ErrorSchema_;
      declare static readonly options?: OptionsSchema_;
      declare static readonly "~Provides": "provides" extends keyof Config
        ? Config["provides"]
        : never;
      declare static readonly "~Requires": "requires" extends keyof Config
        ? Config["requires"]
        : never;
      declare static readonly "~Error": ErrorSchema_;
      declare static readonly "~FunctionTypes": FunctionTypesFromConfig<FunctionTypesConfig_>;
      declare static readonly "~Self": Self;
      declare static readonly "~Options": OptionsSchema_;
      declare readonly [TypeId]: TypeId;
      declare readonly key: Key_;
    }
    if (options.error !== undefined) {
      Lazy.defineProperty(MiddlewareSpecClass, "error", options.error);
    }
    if (options.options !== undefined) {
      Lazy.defineProperty(MiddlewareSpecClass, "options", options.options);
    }
    return MiddlewareSpecClass;
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

/**
 * @internal
 */
export const errorSchemas = (
  middlewareSpecs: ReadonlyArray<AnyMiddlewareSpec>,
): ReadonlyArray<Schema.Codec<unknown>> =>
  Array.flatMap(middlewareSpecs, (middlewareSpec) =>
    "error" in middlewareSpec && middlewareSpec.error !== undefined
      ? [middlewareSpec.error]
      : [],
  );

/**
 * A branded, unconstructible type carrying a spec-authoring error message.
 * Surfaced as (part of) a parameter type so the diagnostic names the exact
 * problem at the `.middleware()`/`.addFunction()` call site.
 *
 * @internal
 */
export interface AttachmentError<Message extends string> {
  readonly "~@confect/core/MiddlewareSpec/AttachmentError": Message;
}

type FunctionTypeOf<FunctionSpec_ extends FunctionSpec.AnyWithProps> =
  FunctionSpec_["runtimeAndFunctionType"]["functionType"];

type ValidationResult<Errors> = [Errors] extends [never] ? unknown : Errors;

/**
 * A matching-type Convex-provenance function is rejected rather than silently
 * skipped: its raw handler passes through Confect untouched, so the middleware
 * could not actually cover it, and skipping it would be a policy hole.
 *
 * @internal
 */
export type ValidateFunction<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  MiddlewareSpec_ extends AnyMiddlewareSpec,
> = FunctionSpec_ extends unknown
  ? MiddlewareSpec_ extends unknown
    ? FunctionSpec_ extends {
        readonly functionProvenance: { readonly _tag: "Convex" };
      }
      ? FunctionTypeOf<FunctionSpec_> extends FunctionTypes<MiddlewareSpec_>
        ? AttachmentError<`Convex-provenance function "${FunctionSpec_["name"]}" cannot be covered by middleware "${Key<MiddlewareSpec_>}"—attach middleware only to groups whose matching-type functions are all Confect-provenance`>
        : never
      : [
            Extract<
              FunctionSpec.MiddlewareSpecs<FunctionSpec_>,
              { readonly key: Key<WithoutOptions<MiddlewareSpec_>> }
            >,
          ] extends [never]
        ? FunctionTypeOf<FunctionSpec_> extends FunctionTypes<MiddlewareSpec_>
          ? never
          : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" does not declare function type "${FunctionTypeOf<FunctionSpec_>}", the type of function "${FunctionSpec_["name"]}"`>
        : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" is already attached to function "${FunctionSpec_["name"]}"`>
    : never
  : never;

/**
 * Attachment order is chain order, so requiring `requires` to be satisfied by
 * already-attached middleware is exactly requiring the provider to run
 * earlier.
 *
 * @internal
 */
export type ValidateAttach<
  MiddlewareSpec_ extends AnyMiddlewareSpec,
  Functions_ extends FunctionSpec.AnyWithProps,
  MiddlewareSpecs_ extends AnyMiddlewareSpec,
> = [
  Extract<
    MiddlewareSpecs_,
    { readonly key: Key<WithoutOptions<MiddlewareSpec_>> }
  >,
] extends [never]
  ? [Exclude<Requires<MiddlewareSpec_>, Provides<MiddlewareSpecs_>>] extends [
      never,
    ]
    ? ValidationResult<ValidateFunction<Functions_, MiddlewareSpec_>>
    : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" requires services that no middleware attached earlier to this group provides—attach the providing middleware first`>
  : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" is already attached to this group`>;

/**
 * @internal
 */
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
            { readonly key: Key<WithoutOptions<FunctionMiddlewareSpec>> }
          >,
        ] extends [never]
        ? never
        : AttachmentError<`Middleware "${Key<FunctionMiddlewareSpec>}" is attached to both function "${FunctionSpec_["name"]}" and its group`>
      : never
    : never;

/**
 * The parameter-type validation applied to the group spec at `GroupImpl.make`:
 * every function's attached middleware must have its `requires` services
 * provided by some middleware covering that function (the group's or the
 * function's own). Checked here—with the group fully assembled—rather than at
 * the spec builders, because a function-level middleware's `requires` may
 * legitimately be satisfied by a group middleware the function spec never sees,
 * and group attachment is declaratively order-independent with respect to
 * `addFunction`.
 *
 * @internal
 */
export type ValidateImplRequires<
  Functions_ extends FunctionSpec.AnyWithProps,
  GroupMiddlewareSpecs_ extends AnyMiddlewareSpec,
> = ValidationResult<
  Functions_ extends unknown
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

/**
 * @internal
 */
export type ValidateFunctionAttach<
  MiddlewareSpec_ extends AnyMiddlewareSpec,
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
  MiddlewareSpecs_ extends AnyMiddlewareSpec,
> = FunctionProvenance_ extends { readonly _tag: "Convex" }
  ? AttachmentError<`Plain Convex functions cannot have middleware—their raw handlers are passed through untouched`>
  : [
        Extract<
          MiddlewareSpecs_,
          { readonly key: Key<WithoutOptions<MiddlewareSpec_>> }
        >,
      ] extends [never]
    ? RuntimeAndFunctionType_["functionType"] extends FunctionTypes<MiddlewareSpec_>
      ? unknown
      : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" does not declare function type "${RuntimeAndFunctionType_["functionType"]}"`>
    : AttachmentError<`Middleware "${Key<MiddlewareSpec_>}" is already attached to this function`>;
