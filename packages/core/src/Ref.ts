import type {
  FunctionReference as ConvexFunctionReference,
  FunctionVisibility,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { Value } from "convex/values";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as FunctionProvenance from "./FunctionProvenance";
import type * as FunctionSpec from "./FunctionSpec";
import * as Lazy from "./Lazy";
import * as MiddlewareSpec from "./MiddlewareSpec";
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
  /** @internal */
  readonly decoding: Decoding;
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

export interface AnyPublicPaginatedQuery extends Ref<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  {
    [key: string]: any;
    paginationOpts: PaginationOptions;
  },
  PaginationResult<any>,
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

export type FromFunctionSpec<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  MiddlewareError = never,
> = Ref<
  FunctionSpec.GetRuntimeAndFunctionType<FunctionSpec_>,
  FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
  FunctionSpec.Args<FunctionSpec_>,
  FunctionSpec.Returns<FunctionSpec_>,
  FunctionSpec.Error<FunctionSpec_> | MiddlewareError
>;

/**
 * A ref's wire-boundary codec data, built once per ref from its spec's
 * `FunctionProvenance`. Only the `Confect` arm carries schemas, middleware,
 * and error data; a `Convex`-provenance ref has nowhere to put any of them,
 * so states like (Convex provenance, covering middleware) are unrepresentable
 * by construction. Presence and content of the error union are one value:
 * `errorSchema` is `Some` exactly when decoding can succeed, with the
 * schema itself built lazily inside the box (forcing the spec's error
 * thunks only when it is first read).
 *
 * @internal
 */
export type Decoding = ConfectDecoding | ConvexDecoding;

/** @internal */
export interface ConfectDecoding {
  readonly _tag: "Confect";
  readonly provenance: ConfectProvenance;
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyService>;
  readonly errorSchema: Option.Option<{
    readonly schema: Schema.Codec<any, any>;
  }>;
}

/** @internal */
export interface ConvexDecoding {
  readonly _tag: "Convex";
}

type ConfectProvenance = Extract<
  FunctionProvenance.FunctionProvenance,
  { _tag: "Confect" }
>;

const convexDecoding: ConvexDecoding = { _tag: "Convex" };

// `"error" in` presence checks don't invoke the provenance's lazy getters
// (see `Lazy`), so `Some`/`None` is decided eagerly while the schema inside
// the box stays lazy. The `Some` arm's schema list is non-empty by
// construction — no undefined branch.
const makeConfectDecoding = (
  provenance: ConfectProvenance,
  middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyService>,
): ConfectDecoding => {
  const hasError =
    "error" in provenance ||
    middlewareSpecs.some((middleware) => "error" in middleware);

  const errorSchemaBox = {};
  Lazy.defineProperty(errorSchemaBox, "schema", () => {
    const schemas = [
      ...("error" in provenance
        ? [provenance.error as Schema.Codec<any, any>]
        : []),
      ...MiddlewareSpec.errorSchemas(middlewareSpecs),
    ];
    return schemas.length === 1 ? schemas[0] : Schema.Union(schemas);
  });

  return {
    _tag: "Confect",
    provenance,
    middlewareSpecs,
    errorSchema: hasError
      ? Option.some(
          errorSchemaBox as { readonly schema: Schema.Codec<any, any> },
        )
      : Option.none(),
  };
};

export const make = <FunctionSpec_ extends FunctionSpec.AnyWithProps>(
  /**
   * The namespace portion of a Convex function name, i.e. the part before the
   * colon. For example, for `myGroupDir/myGroupMod:myFunc` this would be
   * `myGroupDir/myGroupMod`.
   */
  functionNamespace: string,
  functionSpec: FunctionSpec_,
  /** The middleware covering this function. */
  middlewares: ReadonlyArray<MiddlewareSpec.AnyService> = [],
): FromFunctionSpec<FunctionSpec_> => {
  const provenance = functionSpec.functionProvenance;
  const decoding =
    provenance._tag === "Confect"
      ? makeConfectDecoding(provenance, middlewares)
      : convexDecoding;

  const ref = { functionSpec, functionNamespace, decoding };

  return ref as unknown as FromFunctionSpec<FunctionSpec_>;
};

export const getConvexFunctionName = (ref: Any): string =>
  `${ref.functionNamespace}:${ref.functionSpec.name}`;

const functionReferenceCache = new Map<string, FunctionReference<Any>>();

export const getFunctionReference = <Ref_ extends Any>(
  ref: Ref_,
): FunctionReference<Ref_> => {
  const functionName = getConvexFunctionName(ref);

  const cached = functionReferenceCache.get(functionName);
  if (cached !== undefined) {
    return cached as FunctionReference<Ref_>;
  }

  const functionReference = makeFunctionReference(functionName);
  functionReferenceCache.set(functionName, functionReference);

  return functionReference as FunctionReference<Ref_>;
};

export const hasErrorSchema = (ref: Any): boolean =>
  ref.decoding._tag === "Confect" && Option.isSome(ref.decoding.errorSchema);

export const encodeArgs = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): Effect.Effect<unknown, Schema.SchemaError> =>
  ref.decoding._tag === "Confect"
    ? Schema.encodeEffect(ref.decoding.provenance.args)(args)
    : Effect.succeed(args);

export const decodeReturns = <Ref_ extends Any>(
  ref: Ref_,
  returns: unknown,
): Effect.Effect<Returns<Ref_>, Schema.SchemaError> =>
  ref.decoding._tag === "Confect"
    ? Schema.decodeUnknownEffect(ref.decoding.provenance.returns)(returns)
    : Effect.succeed(returns as Returns<Ref_>);

export const encodeArgsSync = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): unknown =>
  ref.decoding._tag === "Confect"
    ? Schema.encodeSync(ref.decoding.provenance.args)(args)
    : args;

export const decodeArgsSync = <Ref_ extends Any>(
  ref: Ref_,
  encodedArgs: unknown,
): Args<Ref_> =>
  (ref.decoding._tag === "Confect"
    ? Schema.decodeUnknownSync(ref.decoding.provenance.args)(encodedArgs)
    : encodedArgs) as Args<Ref_>;

export const encodeReturnsSync = <Ref_ extends Any>(
  ref: Ref_,
  returns: Returns<Ref_>,
): unknown =>
  ref.decoding._tag === "Confect"
    ? Schema.encodeSync(ref.decoding.provenance.returns)(returns)
    : returns;

export const decodeReturnsSync = <Ref_ extends Any>(
  ref: Ref_,
  encodedReturns: unknown,
): Returns<Ref_> =>
  (ref.decoding._tag === "Confect"
    ? Schema.decodeUnknownSync(ref.decoding.provenance.returns)(encodedReturns)
    : encodedReturns) as Returns<Ref_>;

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
      const decoded = decodeErrorOption(ref, error.data);
      if (Option.isSome(decoded)) {
        return decoded.value;
      }
    }
    return mapUnknownError(error);
  };

/**
 * Decode `encodedError` against the ref's error schema — the function's
 * declared `error` schema unioned with its covering middlewares' error
 * schemas. Returns `None` if the ref declares no typed error at all (Confect
 * ref without an `error` schema and without failing middleware, or a
 * Convex-provenance ref)—by definition there's nothing to decode the value
 * into, and the caller is responsible for deciding what to do (typically:
 * surface the original value as a defect).
 */
const errorSchemaOf = (ref: Any): Option.Option<Schema.Codec<any, any>> =>
  ref.decoding._tag === "Confect"
    ? Option.map(ref.decoding.errorSchema, (box) => box.schema)
    : Option.none();

export const decodeError = <Ref_ extends Any>(
  ref: Ref_,
  encodedError: unknown,
): Effect.Effect<Option.Option<Error<Ref_>>, Schema.SchemaError> =>
  Option.match(errorSchemaOf(ref), {
    onNone: () => Effect.succeed(Option.none<Error<Ref_>>()),
    onSome: (schema) =>
      Effect.map(
        Schema.decodeUnknownEffect(schema)(encodedError),
        Option.some,
      ) as Effect.Effect<Option.Option<Error<Ref_>>, Schema.SchemaError>,
  });

/**
 * Synchronous counterpart to `decodeError`. Returns `None` when the value is
 * not this ref's typed error — either because the ref declares no `error`
 * schema, or because `encodedError` doesn't match the one it declares.
 *
 * The second case is reachable in normal operation: Convex raises its own
 * `ConvexError`s (an `InvalidCursor` pagination error, for instance), and
 * those never match a user-declared error schema. Callers pair this with a
 * fallback that surfaces the original error, so failing to decode must not
 * throw — a `ParseError` here would replace the real error with an opaque one
 * and lose the only useful diagnostic. Hence the `Option` suffix rather than
 * `Sync`, matching `Schema.decodeUnknownOption`: the sibling `*Sync` helpers
 * in this module all throw on a parse failure, and this one deliberately
 * doesn't.
 */
export const decodeErrorOption = <Ref_ extends Any>(
  ref: Ref_,
  encodedError: unknown,
): Option.Option<Error<Ref_>> =>
  Option.flatMap(
    errorSchemaOf(ref),
    (schema) =>
      Schema.decodeUnknownOption(schema)(encodedError) as Option.Option<
        Error<Ref_>
      >,
  );

const missingPaginatedProvenanceError = (ref: Any) =>
  new globalThis.Error(
    `Paginated query ref "${getConvexFunctionName(ref)}" was not built with ` +
      "`FunctionSpec.publicPaginatedQuery` (or `FunctionSpec.internalPaginatedQuery`). " +
      "Paginated encoding and decoding require the user-args and item schemas " +
      "those constructors store. Define the function as, e.g.:\n\n" +
      "  FunctionSpec.publicPaginatedQuery({\n" +
      '    name: "...",\n' +
      "    args: () => Schema.Struct({ ... }), // optional; without paginationOpts\n" +
      "    item: () => ItemSchema,\n" +
      "  })",
  );

const paginatedKind = (
  ref: Any,
  decoding: ConfectDecoding,
): Extract<FunctionProvenance.ConfectKind, { _tag: "Paginated" }> => {
  const kind = decoding.provenance.kind;
  if (kind._tag !== "Paginated") {
    throw missingPaginatedProvenanceError(ref);
  }
  return kind;
};

/**
 * Encode the args of a paginated query ref via its user-args schema —
 * `paginationOpts` is excluded, since the pagination protocol fields are
 * managed by the client (e.g. `usePaginatedQuery` from `convex/react`), not by
 * the caller. Requires a ref built with `FunctionSpec.publicPaginatedQuery`
 * (or `internalPaginatedQuery`).
 */
export const encodePaginatedQueryArgsSync = <
  Ref_ extends AnyPublicPaginatedQuery,
>(
  ref: Ref_,
  args: Omit<Args<Ref_>, "paginationOpts">,
): unknown =>
  ref.decoding._tag === "Confect"
    ? Schema.encodeUnknownSync(paginatedKind(ref, ref.decoding).userArgs)(args)
    : args;

/**
 * Decode a page of a paginated query's results via the ref's item schema.
 * Requires a ref built with `FunctionSpec.publicPaginatedQuery` (or
 * `internalPaginatedQuery`).
 */
export const decodePaginationPageSync = <Ref_ extends AnyPublicPaginatedQuery>(
  ref: Ref_,
  encodedPage: unknown,
): Returns<Ref_>["page"] =>
  (ref.decoding._tag === "Confect"
    ? Schema.decodeUnknownSync(paginatedKind(ref, ref.decoding).page)(
        encodedPage,
      )
    : encodedPage) as Returns<Ref_>["page"];

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
): Effect.Effect<Returns<Ref_>, E | Error<Ref_> | Schema.SchemaError> =>
  Effect.gen(function* () {
    const functionReference = getFunctionReference(ref);
    const invoke = (
      encodedArgs: unknown,
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
