import * as Result from "effect/Result";
import * as Array from "effect/Array";
import type * as MiddlewareAttachment from "./MiddlewareAttachment";
import type {
  DefaultFunctionArgs,
  FunctionReference as ConvexFunctionReference,
  FunctionVisibility,
  PaginationResult,
} from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { Value } from "convex/values";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as FunctionProvenance from "./FunctionProvenance";
import type * as FunctionSpec from "./FunctionSpec";
import type * as PaginationOptions from "./PaginationOptions";
import type { OmitKey } from "./Types";
import * as Lazy from "./Lazy";
import * as MiddlewareSpec from "./MiddlewareSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

/**
 * The common contract of a generated function ref. Its generic parameters track
 * runtime, visibility, decoded args, decoded returns, and typed failures. Only
 * `convexFunctionName` is runtime data here; the `~` fields carry types.
 *
 * @category Models
 */
export interface Base<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends DefaultFunctionArgs,
  Returns_,
  Error_ = never,
> {
  /**
   * The runtime and function kind carried only at the type level.
   *
   * @category Models
   */
  readonly "~RuntimeAndFunctionType": RuntimeAndFunctionType_;
  /**
   * The function visibility carried only at the type level.
   *
   * @category Models
   */
  readonly "~FunctionVisibility": FunctionVisibility_;
  /**
   * Decoded call-argument types; not a runtime property.
   *
   * @category Models
   */
  readonly "~Args": Args_;
  /**
   * Decoded result type; not a runtime property.
   *
   * @category Models
   */
  readonly "~Returns": Returns_;
  /**
   * The union of declared function and covering middleware failures; not a
   * runtime property.
   *
   * @category Models
   */
  readonly "~Error": Error_;
  /**
   * The Convex wire name, such as `notes:list` or `team/notes:list`.
   *
   * @category Models
   */
  readonly convexFunctionName: string;
}

/**
 * A generated reference that identifies one Convex function by its wire name.
 * Its type parameters describe the arguments callers supply, the result they
 * receive, and any declared failures.
 *
 * **When to use**
 *
 * Use with a client, function runner, or scheduler: pass a leaf from the
 * generated `refs` module rather than calling the ref as a function.
 *
 * **Details**
 *
 * A `Confect` ref carries codecs for its arguments, result, and declared
 * failures. A `Convex` ref passes arguments and results through unchanged.
 *
 * @category Models
 */
export type Ref<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends DefaultFunctionArgs,
  Returns_,
  Error_ = never,
> =
  | ConfectRefWithTypes<
      RuntimeAndFunctionType_,
      FunctionVisibility_,
      FunctionProvenance.ArgsFields,
      Args_,
      Schema.Codec<Returns_, unknown>,
      Schema.Codec<Error_, unknown>
    >
  | ConvexRef<
      RuntimeAndFunctionType_,
      FunctionVisibility_,
      Args_,
      Returns_,
      Error_
    >;

/**
 * A generated reference to a function declared with Effect codecs. Its argument
 * type comes from the field map, its result type from the return codec, and its
 * failure type from both the function and its middleware.
 *
 * **Details**
 *
 * The `args`, `returns`, and optional `error` codecs are lazy. The `error`
 * field contains only the function's own failure codec; the middleware
 * declarations carry their failure codecs separately.
 *
 * @category Models
 *
 * @see {@link ConvexRef} for a registered Convex function without Confect codecs.
 */
export type ConfectRef<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  ArgsFields_ extends FunctionProvenance.ArgsFields,
  ReturnsSchema_ extends Schema.Codec<unknown>,
  ErrorSchema_ extends Schema.Codec<unknown> = never,
  MiddlewareError_ = never,
> = ConfectRefWithTypes<
  RuntimeAndFunctionType_,
  FunctionVisibility_,
  ArgsFields_,
  Schema.Struct.Type<ArgsFields_>,
  ReturnsSchema_,
  ErrorSchema_,
  MiddlewareError_
>;

/**
 * Supplying the already derived argument type avoids repeatedly expanding
 * `Schema.Struct` for every leaf in a generated ref tree. The declared codecs
 * stay intact; middleware errors widen only the invocation's error type.
 */
interface ConfectRefWithTypes<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  ArgsFields_ extends FunctionProvenance.ArgsFields,
  Args_ extends DefaultFunctionArgs,
  ReturnsSchema_ extends Schema.Codec<unknown>,
  ErrorSchema_ extends Schema.Codec<unknown>,
  MiddlewareError_ = never,
> extends Base<
  RuntimeAndFunctionType_,
  FunctionVisibility_,
  Args_,
  ReturnsSchema_["Type"],
  ErrorSchema_["Type"] | MiddlewareError_
> {
  /**
   * Identifies a ref whose args, returns, and typed failures use Effect codecs.
   *
   * @category Models
   */
  readonly _tag: "Confect";
  /**
   * The lazy argument codec and its field map; includes `paginationOpts` for
   * paginated queries.
   *
   * @category Schemas
   */
  readonly args: FunctionProvenance.ArgsSchema<ArgsFields_>;
  /**
   * The lazy result codec, including the page wrapper for paginated queries.
   *
   * @category Schemas
   */
  readonly returns: ReturnsSchema_;
  /**
   * Whether the declaration is standard or paginated; paginated metadata
   * retains user-argument and item codecs separately from the wire-level page
   * shape.
   *
   * @category Models
   */
  readonly kind: FunctionProvenance.ConfectKind;
  /**
   * Covering middleware in execution order: group attachments, then function
   * attachments.
   *
   * @category Middleware
   */
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyMiddlewareSpec>;
  /**
   * Covering middleware paired with its client-safe attachment values.
   *
   * @category Middleware
   */
  readonly middlewareAttachments: ReadonlyArray<MiddlewareAttachment.MiddlewareAttachment>;
  /**
   * The function's own lazy failure codec, absent if none was declared.
   * Middleware failure codecs are stored on their declarations, not merged
   * here.
   *
   * @category Schemas
   */
  readonly error?: ErrorSchema_;
}

/**
 * A generated ref for a plain Convex function. It carries the function name and
 * inferred call types, but no Effect argument, return, or error codecs. Confect
 * callers pass its args and results through without codec conversion.
 *
 * @category Models
 *
 * @see {@link ConfectRef} for a function declared with Effect codecs.
 */
export interface ConvexRef<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends DefaultFunctionArgs,
  Returns_,
  Error_ = never,
> extends Base<
  RuntimeAndFunctionType_,
  FunctionVisibility_,
  Args_,
  Returns_,
  Error_
> {
  /**
   * Identifies a plain Convex ref with no Effect codec conversion.
   *
   * @category Models
   */
  readonly _tag: "Convex";
}

/**
 * Ref view that retains the kind and visibility while erasing the call
 * signature.
 *
 * @internal
 */
export type ErasedRef<
  Kind extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  Visibility extends FunctionVisibility,
  // oxlint-disable-next-line typescript/no-explicit-any -- Ref.Args, Ref.Returns and Ref.Error intentionally project any from an erased ref.
> = Ref<Kind, Visibility, any, any, any>;

/**
 * @internal
 */
// oxlint-disable-next-line typescript/no-explicit-any -- Generic ref consumers accept every runtime and visibility, including kind-specific callbacks.
export type Any = ErasedRef<any, any>;

/**
 * Erased Confect-provenance ref used by provenance-specific APIs.
 *
 * @internal
 */
export type AnyConfect = Extract<Any, { readonly _tag: "Confect" }>;

/**
 * @internal
 */
export type AnyInternal = ErasedRef<Any["~RuntimeAndFunctionType"], "internal">;

/**
 * @internal
 */
export type AnyPublic = ErasedRef<Any["~RuntimeAndFunctionType"], "public">;

/**
 * @internal
 */
export type AnyQuery = ErasedRef<
  RuntimeAndFunctionType.AnyQuery,
  FunctionVisibility
>;

type PaginatedQueryWithVisibility<
  FunctionVisibility_ extends FunctionVisibility,
> = Ref<
  RuntimeAndFunctionType.AnyQuery,
  FunctionVisibility_,
  DefaultFunctionArgs & {
    paginationOpts: typeof PaginationOptions.PaginationOptions.Type;
  },
  PaginationResult<unknown>,
  unknown
>;

/**
 * @internal
 */
export type AnyPaginatedQuery =
  PaginatedQueryWithVisibility<FunctionVisibility>;

/**
 * @internal
 */
export type AnyMutation = ErasedRef<
  RuntimeAndFunctionType.AnyMutation,
  FunctionVisibility
>;

/**
 * @internal
 */
export type AnyAction = ErasedRef<
  RuntimeAndFunctionType.AnyAction,
  FunctionVisibility
>;

/**
 * @internal
 */
export type AnyPublicQuery = ErasedRef<
  RuntimeAndFunctionType.AnyQuery,
  "public"
>;

/**
 * @internal
 */
export type AnyConfectPublicQuery = Extract<AnyPublicQuery, AnyConfect>;

/**
 * @internal
 */
export type AnyPublicPaginatedQuery = PaginatedQueryWithVisibility<"public">;

/**
 * @internal
 */
export type AnyConfectPublicPaginatedQuery = Extract<
  AnyPublicPaginatedQuery,
  AnyConfect
>;

/**
 * @internal
 */
export type AnyPublicMutation = ErasedRef<
  RuntimeAndFunctionType.AnyMutation,
  "public"
>;

/**
 * @internal
 */
export type AnyConfectPublicMutation = Extract<AnyPublicMutation, AnyConfect>;

/**
 * @internal
 */
export type AnyPublicAction = ErasedRef<
  RuntimeAndFunctionType.AnyAction,
  "public"
>;

/**
 * @internal
 */
export type AnyConfectPublicAction = Extract<AnyPublicAction, AnyConfect>;

/**
 * @internal
 */
export type GetRuntimeAndFunctionType<Ref_> = Ref_ extends {
  readonly "~RuntimeAndFunctionType": infer RuntimeAndFunctionType_ extends
    RuntimeAndFunctionType.RuntimeAndFunctionType;
}
  ? RuntimeAndFunctionType_
  : never;

/**
 * @internal
 */
export type GetRuntime<Ref_> = RuntimeAndFunctionType.GetRuntime<
  GetRuntimeAndFunctionType<Ref_>
>;

/**
 * @internal
 */
export type GetFunctionType<Ref_> = RuntimeAndFunctionType.GetFunctionType<
  GetRuntimeAndFunctionType<Ref_>
>;

/**
 * @internal
 */
export type GetFunctionVisibility<Ref_> = Ref_ extends {
  readonly "~FunctionVisibility": infer FunctionVisibility_;
}
  ? FunctionVisibility_
  : never;

/**
 * @internal
 */
export type Args<Ref_> = Ref_ extends {
  readonly "~Args": infer Args_;
}
  ? Args_
  : never;

/**
 * The field map captured by a Confect-provenance ref.
 *
 * @internal
 */
export type ArgsFields<Ref_> = Ref_ extends {
  readonly _tag: "Confect";
  readonly args: {
    readonly fields: infer ArgsFields_ extends FunctionProvenance.ArgsFields;
  };
}
  ? ArgsFields_
  : never;

/**
 * The assembled args schema carried by a Confect-provenance ref.
 *
 * @internal
 */
export type ArgsSchema<Ref_> = Ref_ extends {
  readonly _tag: "Confect";
  readonly args: infer ArgsSchema_ extends FunctionProvenance.AnyArgsSchema;
}
  ? ArgsSchema_
  : never;

/**
 * @internal
 */
export type OptionalArgs<Ref_ extends Any> = keyof Args<Ref_> extends never
  ? [args?: Args<Ref_>]
  : [args: Args<Ref_>];

/**
 * Supplies the empty argument object when a generated caller omits its optional
 * arguments.
 *
 * @internal
 */
export const argsOrEmpty = <Ref_ extends Any>(
  args: OptionalArgs<Ref_> | [...OptionalArgs<Ref_>, options?: unknown],
): Args<Ref_> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- OptionalArgs only permits omission for a ref with no argument keys.
  (args[0] ?? {}) as Args<Ref_>;

/**
 * @internal
 */
export type Returns<Ref_> = Ref_ extends { readonly "~Returns": infer Returns_ }
  ? Returns_
  : never;

/**
 * The decoded user arguments of a paginated query, excluding `paginationOpts`.
 * When no user arguments remain, only an empty object is accepted.
 *
 * @internal
 */
export type PaginatedArgs<Query extends AnyPublicPaginatedQuery> =
  OmitKey<Args<Query>, "paginationOpts"> extends infer Args_
    ? keyof Args_ extends never
      ? Record<string, never>
      : Args_
    : never;

/**
 * The decoded item type of a paginated query's `page` field.
 *
 * @internal
 */
export type PaginatedItem<Query extends AnyPublicPaginatedQuery> =
  Returns<Query>["page"][number];

/**
 * @internal
 */
export type Error<Ref_> = Ref_ extends { readonly "~Error": infer Error_ }
  ? Error_
  : never;

/**
 * @internal
 */
export type FunctionReference<Ref_ extends Any> = ConvexFunctionReference<
  GetFunctionType<Ref_>,
  GetFunctionVisibility<Ref_>
>;

/**
 * Computes the type of a leaf in the generated ref tree. Use `typeof
 * refs.public.group.fn` or `typeof refs.internal.group.fn` from the default
 * `confect/_generated/refs` import for a concrete function.
 *
 * @internal
 */
export type FromFunctionSpec<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  MiddlewareError = never,
> = FromFunctionSpecHelper<
  FunctionSpec_,
  FunctionSpec.GetRuntimeAndFunctionType<FunctionSpec_>,
  FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
  FunctionSpec.ArgsFields<FunctionSpec_>,
  FunctionSpec.Args<FunctionSpec_>,
  MiddlewareError
>;

type FromFunctionSpecHelper<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  ArgsFields_ extends FunctionProvenance.ArgsFields,
  Args_ extends DefaultFunctionArgs,
  MiddlewareError,
> = FunctionSpec_ extends {
  readonly functionProvenance: FunctionProvenance.AnyConvex;
}
  ? ConvexRef<
      RuntimeAndFunctionType_,
      FunctionVisibility_,
      Args_ extends DefaultFunctionArgs ? Args_ : never,
      FunctionSpec.Returns<FunctionSpec_>,
      never
    >
  : FunctionSpec_ extends {
        readonly functionProvenance: infer Provenance extends
          FunctionProvenance.AnyConfect;
      }
    ? ConfectRefWithTypes<
        RuntimeAndFunctionType_,
        FunctionVisibility_,
        ArgsFields_,
        Args_,
        Provenance["returns"],
        FunctionSpec.ErrorSchema<FunctionSpec_>,
        MiddlewareError
      >
    : Ref<
        RuntimeAndFunctionType_,
        FunctionVisibility_,
        Args_,
        FunctionSpec.Returns<FunctionSpec_>,
        FunctionSpec.Error<FunctionSpec_> | MiddlewareError
      >;

/**
 * Builds a leaf in the generated ref tree. Pass the corresponding `refs.public`
 * or `refs.internal` leaf from `confect/_generated/refs` to a client, runner,
 * or scheduler instead of constructing it.
 *
 * @internal
 */
export const make = <FunctionSpec_ extends FunctionSpec.AnyWithProps>(
  /**
   * The namespace portion of a Convex function name, i.e. the part before the
   * colon. For example, for `myGroupDir/myGroupMod:myFunc` this would be
   * `myGroupDir/myGroupMod`.
   */
  convexFunctionNamespace: string,
  functionSpec: FunctionSpec_,
  groupMiddlewareAttachments: ReadonlyArray<MiddlewareAttachment.MiddlewareAttachment> = [],
): FromFunctionSpec<FunctionSpec_> => {
  const convexFunctionName = `${convexFunctionNamespace}:${functionSpec.name}`;

  const built = Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Convex", () => ({
      _tag: "Convex" as const,
      convexFunctionName,
    })),
    Match.tag("Confect", (provenance) => {
      const ref = {
        _tag: "Confect" as const,
        convexFunctionName,
        kind: provenance.kind,
        middlewareAttachments: [
          ...groupMiddlewareAttachments,
          ...functionSpec.middlewareAttachments,
        ],
        get middlewareSpecs() {
          return Array.map(
            this.middlewareAttachments,
            (attachment) => attachment.spec,
          );
        },
      };

      Lazy.defineProperty(ref, "args", () => provenance.args);
      Lazy.defineProperty(ref, "returns", () => provenance.returns);
      if ("error" in provenance) {
        Lazy.defineProperty(ref, "error", () => provenance.error);
      }

      return ref;
    }),
    Match.exhaustive,
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Generated refs carry the spec's exact call signature and visibility as phantom fields.
  return built as FromFunctionSpec<FunctionSpec_>;
};

/**
 * @internal
 */
export const getConvexFunctionName = (ref: Any): string =>
  ref.convexFunctionName;

const functionReferenceCache = new Map<string, FunctionReference<Any>>();

/**
 * @internal
 */
export const getFunctionReference = <Ref_ extends Any>(
  ref: Ref_,
): FunctionReference<Ref_> => {
  const convexFunctionName = getConvexFunctionName(ref);

  let reference = functionReferenceCache.get(convexFunctionName);
  if (reference === undefined) {
    reference = makeFunctionReference(convexFunctionName);
    functionReferenceCache.set(convexFunctionName, reference);
  }
  return reference;
};

/**
 * @internal
 */
export const hasErrorSchema = (ref: Any): boolean =>
  Match.value(ref).pipe(
    Match.tag(
      "Confect",
      (confectRef) =>
        "error" in confectRef ||
        Array.some(
          confectRef.middlewareSpecs,
          (middlewareSpec) => "error" in middlewareSpec,
        ),
    ),
    Match.tag("Convex", () => false),
    Match.exhaustive,
  );

/**
 * @internal
 */
export const encodeArgs = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): Effect.Effect<DefaultFunctionArgs, Schema.SchemaError> =>
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.encodeEffect(confectRef.args)(args),
    ),
    Match.tag("Convex", () => Effect.succeed(args)),
    Match.exhaustive,
  );

/**
 * @internal
 */
export const decodeReturns = <Ref_ extends Any>(
  ref: Ref_,
  returns: unknown,
): Effect.Effect<Returns<Ref_>, Schema.SchemaError> =>
  Match.value<RefWithReturns<Returns<Ref_>>>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.decodeUnknownEffect(confectRef.returns)(returns),
    ),
    Match.tag("Convex", () =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Plain Convex refs use the registered function's return type and deliberately have no decoder.
      Effect.succeed(returns as Returns<Ref_>),
    ),
    Match.exhaustive,
  );

type RefWithReturns<A> = Ref<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  DefaultFunctionArgs,
  A,
  unknown
>;

/**
 * @internal
 */
export const encodeArgsSync = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): DefaultFunctionArgs =>
  Match.typeTags<Any, DefaultFunctionArgs>()({
    Confect: (confectRef) =>
      Result.getOrThrow(Schema.encodeResult(confectRef.args)(args)),
    Convex: () => args,
  })(ref);

/**
 * @internal
 */
export const decodeArgsSync = <Ref_ extends Any>(
  ref: Ref_,
  encodedArgs: unknown,
): Args<Ref_> =>
  Match.typeTags<Any, Args<Ref_>>()({
    Confect: (confectRef) =>
      Result.getOrThrow(
        Schema.decodeUnknownResult<
          Schema.Codec<Args<Ref_>, DefaultFunctionArgs>
        >(confectRef.args)(encodedArgs),
      ),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Plain Convex arguments pass through unchanged; the native ref supplies their type.
    Convex: () => encodedArgs as Args<Ref_>,
  })(ref);

/**
 * @internal
 */
export const encodeReturnsSync = <Ref_ extends Any>(
  ref: Ref_,
  returns: Returns<Ref_>,
  // oxlint-disable-next-line quality/no-unknown-returns -- Refs carry the decoded return type, not a guarantee about the wire representation of a custom return codec.
): unknown =>
  Match.value<RefWithReturns<Returns<Ref_>>>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Result.getOrThrow(Schema.encodeResult(confectRef.returns)(returns)),
    ),
    Match.tag("Convex", () => returns),
    Match.exhaustive,
  );

/**
 * @internal
 */
export const decodeReturnsSync = <Ref_ extends Any>(
  ref: Ref_,
  encodedReturns: unknown,
): Returns<Ref_> =>
  Match.typeTags<RefWithReturns<Returns<Ref_>>, Returns<Ref_>>()({
    Confect: (confectRef) =>
      Result.getOrThrow(
        Schema.decodeUnknownResult(confectRef.returns)(encodedReturns),
      ),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- As in decodeReturns, a native ref describes the response but carries no runtime codec.
    Convex: () => encodedReturns as Returns<Ref_>,
  })(ref);

const ConvexErrorIdentifier = Symbol.for("ConvexError");

/**
 * @internal
 */
export const isConvexError = (error: unknown): error is ConvexError<Value> =>
  error instanceof ConvexError ||
  (typeof error === "object" &&
    error !== null &&
    ConvexErrorIdentifier in error);

/**
 * Build a callback-style handler that decodes the ref's typed error from a
 * caught `ConvexError`, or else forwards the value to `mapUnknownError`. The
 * fallback is also invoked when the input _is_ a `ConvexError` but the ref
 * doesn't declare a typed-error schema—by definition such a value falls outside
 * the ref's error contract. Useful when adapting non-Effect APIs (e.g. emitter
 * callbacks for streamed subscriptions) to the same error semantics that
 * `runWithCodec` provides.
 *
 * @internal
 */
export const decodeErrorOrElse =
  <Ref_ extends Any, E>(ref: Ref_, mapUnknownError: (error: unknown) => E) =>
  (error: unknown): Error<Ref_> | E => {
    if (isConvexError(error)) {
      const decoded = decodeErrorOption(ref, error.data);
      if (Option.isSome(decoded)) {
        return decoded.value;
      }
    }
    return mapUnknownError(error);
  };

const errorSchemaOf = <R extends Any>(
  ref: R,
): Option.Option<Schema.Codec<Error<R>, unknown>> =>
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) => {
      const schemas: Array<Schema.Codec<unknown>> = [
        ...("error" in confectRef && confectRef.error !== undefined
          ? [confectRef.error]
          : []),
        ...MiddlewareSpec.errorSchemas(confectRef.middlewareSpecs),
      ];
      if (schemas.length === 0) {
        return Option.none();
      }
      const union = schemas.length === 1 ? schemas[0] : Schema.Union(schemas);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Ref.make derives Error<R> from these same function and middleware declarations.
      return Option.some(union as Schema.Codec<Error<R>, unknown>);
    }),
    Match.tag("Convex", () => Option.none()),
    Match.exhaustive,
  );

/**
 * Decode `encodedError` against the ref's error schema—the function's declared
 * `error` schema unioned with its covering middlewares' error schemas. Returns
 * `None` if the ref declares no typed error at all (Confect ref without an
 * `error` schema and without failing middleware, or a Convex-provenance ref)—by
 * definition there's nothing to decode the value into, and the caller is
 * responsible for deciding what to do (typically: surface the original value as
 * a defect).
 *
 * @internal
 */
export const decodeError = <Ref_ extends Any>(
  ref: Ref_,
  encodedError: unknown,
): Effect.Effect<Option.Option<Error<Ref_>>, Schema.SchemaError> =>
  Option.match(errorSchemaOf(ref), {
    onNone: () => Effect.succeed(Option.none<Error<Ref_>>()),
    onSome: (schema) =>
      Effect.asSome(Schema.decodeUnknownEffect(schema)(encodedError)),
  });

/**
 * Synchronous counterpart to `decodeError`. Returns `None` when the value is
 * not this ref's typed error—either because the ref declares no `error` schema,
 * or because `encodedError` doesn't match the one it declares.
 *
 * The second case is reachable in normal operation: Convex raises its own
 * `ConvexError`s (an `InvalidCursor` pagination error, for instance), and those
 * never match a user-declared error schema. Callers pair this with a fallback
 * that surfaces the original error, so failing to decode must not throw—a
 * `ParseError` here would replace the real error with an opaque one and lose
 * the only useful diagnostic. Hence the `Option` suffix rather than `Sync`,
 * matching `Schema.decodeUnknownOption`: the sibling `*Sync` helpers in this
 * module all throw on a parse failure, and this one deliberately doesn't.
 *
 * @internal
 */
export const decodeErrorOption = <Ref_ extends Any>(
  ref: Ref_,
  encodedError: unknown,
): Option.Option<Error<Ref_>> =>
  Option.flatMap(errorSchemaOf(ref), (schema) =>
    Schema.decodeUnknownOption(schema)(encodedError),
  );

const missingPaginatedProvenanceError = (ref: Any) =>
  new globalThis.Error(
    `Paginated query ref "${getConvexFunctionName(ref)}" was not built with ` +
      "`FunctionSpec.publicPaginatedQuery` (or `FunctionSpec.internalPaginatedQuery`). " +
      "Paginated encoding and decoding require the user-args and item schemas " +
      "those constructors store. Define the function as, e.g.:\n\n" +
      "  FunctionSpec.publicPaginatedQuery({\n" +
      '    name: "...",\n' +
      "    args: () => ({ ... }), // optional; without paginationOpts\n" +
      "    item: () => ItemSchema,\n" +
      "  })",
  );

const paginatedKind = (ref: AnyConfect): FunctionProvenance.Paginated =>
  Match.value(ref.kind).pipe(
    Match.tag("Paginated", (kind) => kind),
    Match.tag("Standard", () => {
      throw missingPaginatedProvenanceError(ref);
    }),
    Match.exhaustive,
  );

/**
 * Encode the args of a paginated query ref via its user-args
 * schema—`paginationOpts` is excluded, since the pagination protocol fields are
 * managed by the client (e.g. `usePaginatedQuery` from `convex/react`), not by
 * the caller. Requires a ref built with `FunctionSpec.publicPaginatedQuery` (or
 * `internalPaginatedQuery`).
 *
 * @internal
 */
export const encodePaginatedQueryArgsSync = <
  Ref_ extends AnyPublicPaginatedQuery,
>(
  ref: Ref_,
  args: Omit<Args<Ref_>, "paginationOpts"> | PaginatedArgs<Ref_>,
): DefaultFunctionArgs =>
  Match.typeTags<AnyPublicPaginatedQuery, DefaultFunctionArgs>()({
    Confect: (confectRef) =>
      Result.getOrThrow(
        Schema.encodeUnknownResult(paginatedKind(confectRef).userArgs)(args),
      ),
    Convex: () => args,
  })(ref);

/**
 * Decode a page of a paginated query's results via the ref's item schema.
 * Requires a ref built with `FunctionSpec.publicPaginatedQuery` (or
 * `internalPaginatedQuery`).
 *
 * @internal
 */
export const decodePaginationPageSync = <Ref_ extends AnyPublicPaginatedQuery>(
  ref: Ref_,
  encodedPage: unknown,
): Returns<Ref_>["page"] =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The paginated ref's page codec is built from its item schema; native refs keep the page returned by Convex.
  Match.value<AnyPublicPaginatedQuery>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Result.getOrThrow(
        Schema.decodeUnknownResult(paginatedKind(confectRef).page)(encodedPage),
      ),
    ),
    Match.tag("Convex", () => encodedPage),
    Match.exhaustive,
  ) as Returns<Ref_>["page"];

/**
 * Encode args via the ref's args schema, invoke `call`, decode returns via the
 * ref's returns schema, and translate any thrown `ConvexError` into the ref's
 * typed error. Anything else the Promise rejects with—network failures,
 * server-side runtime errors, validation failures, etc.—is passed to
 * `mapUnknownError` to be turned into a typed `E`, or surfaced as a defect when
 * no handler is provided.
 *
 * @internal
 */
export const runWithCodec = Effect.fnUntraced(function* <
  Ref_ extends Any,
  E = never,
>(
  ref: Ref_,
  args: Args<Ref_>,
  call: (
    functionReference: FunctionReference<Ref_>,
    encodedArgs: DefaultFunctionArgs,
    // oxlint-disable-next-line quality/no-unknown-returns -- Transport responses stay unknown until decoded with the ref that made the request.
  ) => PromiseLike<unknown>,
  mapUnknownError?: (error: unknown) => E,
): Effect.fn.Return<Returns<Ref_>, E | Error<Ref_> | Schema.SchemaError> {
  const functionReference = getFunctionReference(ref);
  const invoke = (
    encodedArgs: DefaultFunctionArgs,
  ): Effect.Effect<unknown, Error<Ref_> | E> =>
    Effect.tryPromise({
      try: () => Promise.resolve(call(functionReference, encodedArgs)),
      catch: (error): Error<Ref_> | E => {
        if (isConvexError(error)) {
          const decoded = decodeErrorOption(ref, error.data);
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

  const encodedArgs = yield* encodeArgs(ref, args);
  const encodedReturns = yield* invoke(encodedArgs);
  return yield* decodeReturns(ref, encodedReturns);
});
