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
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as FunctionProvenance from "./FunctionProvenance";
import type * as FunctionSpec from "./FunctionSpec";
import * as Lazy from "./Lazy";
import * as MiddlewareSpec from "./MiddlewareSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

export interface Base<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_,
  Returns_,
  Error_ = never,
> {
  readonly "~RuntimeAndFunctionType": RuntimeAndFunctionType_;
  readonly "~FunctionVisibility": FunctionVisibility_;
  readonly "~Args": Args_;
  readonly "~Returns": Returns_;
  readonly "~Error": Error_;
  readonly convexFunctionName: string;
}

/**
 * A reference to a single Convex function, as callers see it: the wire name
 * plus the data needed to encode args, decode returns, and decode typed
 * errors. A ref is one of two shapes, keyed by the spec's provenance.
 */
export type Ref<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_,
  Returns_,
  Error_ = never,
> =
  | ConfectRef<
      RuntimeAndFunctionType_,
      FunctionVisibility_,
      Args_,
      Returns_,
      Error_
    >
  | ConvexRef<
      RuntimeAndFunctionType_,
      FunctionVisibility_,
      Args_,
      Returns_,
      Error_
    >;

export interface ConfectRef<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_,
  Returns_,
  Error_ = never,
  ArgsSchema_ extends Schema.Codec<any, any> = Schema.Codec<any, any>,
  ReturnsSchema_ extends Schema.Codec<any, any> = Schema.Codec<any, any>,
  ErrorSchema_ extends Schema.Codec<any, any> = Schema.Codec<any, any>,
> extends Base<
  RuntimeAndFunctionType_,
  FunctionVisibility_,
  Args_,
  Returns_,
  Error_
> {
  readonly _tag: "Confect";
  readonly args: ArgsSchema_;
  readonly returns: ReturnsSchema_;
  readonly kind: FunctionProvenance.ConfectKind;
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyMiddlewareSpec>;
  readonly error?: ErrorSchema_;
}

export interface ConvexRef<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_,
  Returns_,
  Error_ = never,
> extends Base<
  RuntimeAndFunctionType_,
  FunctionVisibility_,
  Args_,
  Returns_,
  Error_
> {
  readonly _tag: "Convex";
}

export type Any = Ref<any, any, any, any, any>;

export type AnyConfect = ConfectRef<any, any, any, any, any>;

export type AnyInternal = Ref<any, "internal", any, any, any>;

export type AnyPublic = Ref<any, "public", any, any, any>;

export type AnyQuery = Ref<
  RuntimeAndFunctionType.AnyQuery,
  FunctionVisibility,
  any,
  any,
  any
>;

export type AnyPublicPaginatedQuery = Ref<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  {
    [key: string]: any;
    paginationOpts: PaginationOptions;
  },
  PaginationResult<any>,
  any
>;

export type AnyConfectPublicPaginatedQuery = ConfectRef<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  {
    [key: string]: any;
    paginationOpts: PaginationOptions;
  },
  PaginationResult<any>,
  any
>;

export type AnyMutation = Ref<
  RuntimeAndFunctionType.AnyMutation,
  FunctionVisibility,
  any,
  any,
  any
>;

export type AnyAction = Ref<
  RuntimeAndFunctionType.AnyAction,
  FunctionVisibility,
  any,
  any,
  any
>;

export type AnyPublicQuery = Ref<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  any,
  any,
  any
>;

export type AnyConfectPublicQuery = ConfectRef<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  any,
  any,
  any
>;

export type AnyPublicMutation = Ref<
  RuntimeAndFunctionType.AnyMutation,
  "public",
  any,
  any,
  any
>;

export type AnyConfectPublicMutation = ConfectRef<
  RuntimeAndFunctionType.AnyMutation,
  "public",
  any,
  any,
  any
>;

export type AnyPublicAction = Ref<
  RuntimeAndFunctionType.AnyAction,
  "public",
  any,
  any,
  any
>;

export type AnyConfectPublicAction = ConfectRef<
  RuntimeAndFunctionType.AnyAction,
  "public",
  any,
  any,
  any
>;

export type GetRuntimeAndFunctionType<Ref_> = Ref_ extends {
  readonly "~RuntimeAndFunctionType": infer RuntimeAndFunctionType_ extends
    RuntimeAndFunctionType.RuntimeAndFunctionType;
}
  ? RuntimeAndFunctionType_
  : never;

export type GetRuntime<Ref_> = RuntimeAndFunctionType.GetRuntime<
  GetRuntimeAndFunctionType<Ref_>
>;

export type GetFunctionType<Ref_> = RuntimeAndFunctionType.GetFunctionType<
  GetRuntimeAndFunctionType<Ref_>
>;

export type GetFunctionVisibility<Ref_> = Ref_ extends {
  readonly "~FunctionVisibility": infer FunctionVisibility_;
}
  ? FunctionVisibility_
  : never;

export type Args<Ref_> = Ref_ extends { readonly "~Args": infer Args_ }
  ? Args_
  : never;

/**
 * The args schema of a Confect-provenance ref, as declared in its
 * `FunctionSpec`. `never` for Convex-provenance refs, which carry no schema.
 */
export type ArgsSchema<Ref_> = Ref_ extends {
  readonly _tag: "Confect";
  readonly args: infer ArgsSchema_ extends Schema.Codec<any, any>;
}
  ? ArgsSchema_
  : never;

export type OptionalArgs<Ref_ extends Any> = keyof Args<Ref_> extends never
  ? [args?: Args<Ref_>]
  : [args: Args<Ref_>];

export type Returns<Ref_> = Ref_ extends { readonly "~Returns": infer Returns_ }
  ? Returns_
  : never;

export type Error<Ref_> = Ref_ extends { readonly "~Error": infer Error_ }
  ? Error_
  : never;

export type FunctionReference<Ref_ extends Any> = ConvexFunctionReference<
  GetFunctionType<Ref_>,
  GetFunctionVisibility<Ref_>
>;

export type FromFunctionSpec<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  MiddlewareError = never,
> = FromFunctionSpecHelper<
  FunctionSpec_,
  FunctionSpec.GetRuntimeAndFunctionType<FunctionSpec_>,
  FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
  FunctionSpec.Args<FunctionSpec_>,
  FunctionSpec.Returns<FunctionSpec_>,
  FunctionSpec.Error<FunctionSpec_> | MiddlewareError,
  FunctionSpec.ArgsSchema<FunctionSpec_> extends infer ArgsSchema_ extends
    Schema.Codec<any, any>
    ? ArgsSchema_
    : Schema.Codec<any, any>,
  FunctionSpec.ReturnsSchema<FunctionSpec_> extends infer ReturnsSchema_ extends
    Schema.Codec<any, any>
    ? ReturnsSchema_
    : Schema.Codec<any, any>,
  FunctionSpec.ErrorSchema<FunctionSpec_> extends infer ErrorSchema_ extends
    Schema.Codec<any, any>
    ? ErrorSchema_
    : Schema.Codec<any, any>
>;

type FromFunctionSpecHelper<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_,
  Returns_,
  Error_,
  ArgsSchema_ extends Schema.Codec<any, any>,
  ReturnsSchema_ extends Schema.Codec<any, any>,
  ErrorSchema_ extends Schema.Codec<any, any>,
> =
  FunctionSpec_ extends FunctionSpec.WithFunctionProvenance<
    FunctionSpec_,
    FunctionProvenance.AnyConvex
  >
    ? ConvexRef<
        RuntimeAndFunctionType_,
        FunctionVisibility_,
        Args_,
        Returns_,
        Error_
      >
    : FunctionSpec_ extends FunctionSpec.WithFunctionProvenance<
          FunctionSpec_,
          FunctionProvenance.AnyConfect
        >
      ? ConfectRef<
          RuntimeAndFunctionType_,
          FunctionVisibility_,
          Args_,
          Returns_,
          Error_,
          ArgsSchema_,
          ReturnsSchema_,
          ErrorSchema_
        >
      : Ref<
          RuntimeAndFunctionType_,
          FunctionVisibility_,
          Args_,
          Returns_,
          Error_
        >;

export const make = <FunctionSpec_ extends FunctionSpec.AnyWithProps>(
  /**
   * The namespace portion of a Convex function name, i.e. the part before the
   * colon. For example, for `myGroupDir/myGroupMod:myFunc` this would be
   * `myGroupDir/myGroupMod`.
   */
  convexFunctionNamespace: string,
  functionSpec: FunctionSpec_,
  groupMiddlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyMiddlewareSpec> = [],
): FromFunctionSpec<FunctionSpec_> => {
  const convexFunctionName = `${convexFunctionNamespace}:${functionSpec.name}`;

  return Match.value(functionSpec.functionProvenance).pipe(
    Match.tag(
      "Convex",
      (): Any =>
        ({
          _tag: "Convex",
          convexFunctionName,
        }) as Any,
    ),
    Match.tag("Confect", (provenance): Any => {
      const ref = {
        _tag: "Confect" as const,
        convexFunctionName,
        kind: provenance.kind,
        middlewareSpecs: [
          ...groupMiddlewareSpecs,
          ...functionSpec.middlewareSpecs,
        ],
      };

      Lazy.defineProperty(ref, "args", () => provenance.args);
      Lazy.defineProperty(ref, "returns", () => provenance.returns);
      if ("error" in provenance) {
        Lazy.defineProperty(ref, "error", () => provenance.error);
      }

      return ref as unknown as Any;
    }),
    Match.exhaustive,
  ) as FromFunctionSpec<FunctionSpec_>;
};

export const getConvexFunctionName = (ref: Any): string =>
  ref.convexFunctionName;

const functionReferenceCache = new Map<string, FunctionReference<Any>>();

export const getFunctionReference = <Ref_ extends Any>(
  ref: Ref_,
): FunctionReference<Ref_> => {
  const convexFunctionName = getConvexFunctionName(ref);

  const cached = functionReferenceCache.get(convexFunctionName);
  if (cached !== undefined) {
    return cached as FunctionReference<Ref_>;
  }

  const functionReference = makeFunctionReference(convexFunctionName);
  functionReferenceCache.set(convexFunctionName, functionReference);

  return functionReference as FunctionReference<Ref_>;
};

export const hasErrorSchema = (ref: Any): boolean =>
  Match.value(ref).pipe(
    Match.tag(
      "Confect",
      (confectRef) =>
        "error" in confectRef ||
        confectRef.middlewareSpecs.some(
          (middlewareSpec) => "error" in middlewareSpec,
        ),
    ),
    Match.tag("Convex", () => false),
    Match.exhaustive,
  );

export const encodeArgs = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): Effect.Effect<unknown, Schema.SchemaError> =>
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.encodeEffect(confectRef.args)(args),
    ),
    Match.tag("Convex", () => Effect.succeed(args)),
    Match.exhaustive,
  );

export const decodeReturns = <Ref_ extends Any>(
  ref: Ref_,
  returns: unknown,
): Effect.Effect<Returns<Ref_>, Schema.SchemaError> =>
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.decodeUnknownEffect(confectRef.returns)(returns),
    ),
    Match.tag("Convex", () => Effect.succeed(returns as Returns<Ref_>)),
    Match.exhaustive,
  );

export const encodeArgsSync = <Ref_ extends Any>(
  ref: Ref_,
  args: Args<Ref_>,
): unknown =>
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.encodeSync(confectRef.args)(args),
    ),
    Match.tag("Convex", () => args),
    Match.exhaustive,
  );

export const decodeArgsSync = <Ref_ extends Any>(
  ref: Ref_,
  encodedArgs: unknown,
): Args<Ref_> =>
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.decodeUnknownSync(confectRef.args)(encodedArgs),
    ),
    Match.tag("Convex", () => encodedArgs),
    Match.exhaustive,
  ) as Args<Ref_>;

export const encodeReturnsSync = <Ref_ extends Any>(
  ref: Ref_,
  returns: Returns<Ref_>,
): unknown =>
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.encodeSync(confectRef.returns)(returns),
    ),
    Match.tag("Convex", () => returns),
    Match.exhaustive,
  );

export const decodeReturnsSync = <Ref_ extends Any>(
  ref: Ref_,
  encodedReturns: unknown,
): Returns<Ref_> =>
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.decodeUnknownSync(confectRef.returns)(encodedReturns),
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
      const decoded = decodeErrorOption(ref, error.data);
      if (Option.isSome(decoded)) {
        return decoded.value;
      }
    }
    return mapUnknownError(error);
  };

const errorSchemaOf = (ref: Any): Option.Option<Schema.Codec<any, any>> =>
  Match.value(ref).pipe(
    Match.tag("Confect", (confectRef) => {
      const schemas = [
        ...("error" in confectRef && confectRef.error !== undefined
          ? [confectRef.error]
          : []),
        ...MiddlewareSpec.errorSchemas(confectRef.middlewareSpecs),
      ];
      return schemas.length === 0
        ? Option.none<Schema.Codec<any, any>>()
        : Option.some(
            schemas.length === 1 ? schemas[0]! : Schema.Union(schemas),
          );
    }),
    Match.tag("Convex", () => Option.none<Schema.Codec<any, any>>()),
    Match.exhaustive,
  );

/**
 * Decode `encodedError` against the ref's error schema — the function's
 * declared `error` schema unioned with its covering middlewares' error
 * schemas. Returns `None` if the ref declares no typed error at all (Confect
 * ref without an `error` schema and without failing middleware, or a
 * Convex-provenance ref)—by definition there's nothing to decode the value
 * into, and the caller is responsible for deciding what to do (typically:
 * surface the original value as a defect).
 */
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
  ref: ConfectRef<any, any, any, any, any>,
): FunctionProvenance.Paginated =>
  Match.value(ref.kind).pipe(
    Match.tag("Paginated", (kind) => kind),
    Match.tag("Standard", () => {
      throw missingPaginatedProvenanceError(ref);
    }),
    Match.exhaustive,
  );

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
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.encodeUnknownSync(paginatedKind(confectRef).userArgs)(args),
    ),
    Match.tag("Convex", () => args),
    Match.exhaustive,
  );

/**
 * Decode a page of a paginated query's results via the ref's item schema.
 * Requires a ref built with `FunctionSpec.publicPaginatedQuery` (or
 * `internalPaginatedQuery`).
 */
export const decodePaginationPageSync = <Ref_ extends AnyPublicPaginatedQuery>(
  ref: Ref_,
  encodedPage: unknown,
): Returns<Ref_>["page"] =>
  Match.value<Any>(ref).pipe(
    Match.tag("Confect", (confectRef) =>
      Schema.decodeUnknownSync(paginatedKind(confectRef).page)(encodedPage),
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
