import * as Array from "effect/Array";
import type * as MiddlewareAttachment from "./MiddlewareAttachment";
import type {
  DefaultFunctionArgs,
  FunctionType,
  FunctionVisibility,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type * as Schema from "effect/Schema";
import * as Predicate from "effect/Predicate";
import * as FunctionProvenance from "./FunctionProvenance";
import { validateConfectFunctionIdentifier } from "./Identifier";
import type * as MiddlewareSpec from "./MiddlewareSpec";
import * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

/**
 * @internal
 */
export const TypeId = "~@confect/core/FunctionSpec";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export const isFunctionSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

/**
 * The client-safe declaration of a function's name, runtime, visibility,
 * schemas, and middleware. Create one with a function constructor, then add it
 * to a `GroupSpec`. The handler is supplied separately through
 * `@confect/server`; a spec does not execute the function.
 *
 * @category Models
 */
export interface FunctionSpec<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Name_ extends string,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
  MiddlewareSpecs_ extends MiddlewareSpec.AnyMiddlewareSpec = never,
> {
  /**
   * Identifies a Confect function declaration.
   *
   * @category Models
   */
  readonly [TypeId]: TypeId;
  /**
   * The execution runtime and function kind: query, mutation, or action.
   *
   * @category Models
   */
  readonly runtimeAndFunctionType: RuntimeAndFunctionType_;
  /**
   * Whether clients may call this function or only server-side callers may.
   *
   * @category Models
   */
  readonly functionVisibility: FunctionVisibility_;
  /**
   * The function's local name within its group.
   *
   * @category Models
   */
  readonly name: Name_;
  /**
   * Whether the function uses Confect codecs or a plain Convex handler. Confect
   * schemas remain lazy until accessed.
   *
   * @category Models
   */
  readonly functionProvenance: FunctionProvenance_;
  /**
   * Function-level middleware declarations in attachment order.
   *
   * @category Middleware
   */
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpecs_>;
  /**
   * Function-level middleware declarations paired with their attachment
   * options.
   *
   * @category Middleware
   */
  readonly middlewareAttachments: ReadonlyArray<
    MiddlewareAttachment.MiddlewareAttachment<MiddlewareSpecs_>
  >;
}

/**
 * A function declaration with immutable middleware attachment. Each call to
 * `middleware` returns a new builder; the original spec is unchanged.
 *
 * @category Models
 */
export interface Builder<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Name_ extends string,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
  MiddlewareSpecs_ extends MiddlewareSpec.AnyMiddlewareSpec = never,
> extends FunctionSpec<
  RuntimeAndFunctionType_,
  FunctionVisibility_,
  Name_,
  FunctionProvenance_,
  MiddlewareSpecs_
> {
  /**
   * Attach middleware around this function's handler, inside the group chain.
   * Attachments run in order. Supply the options schema's decoded value when
   * the middleware declares options; no decoding or coercion is performed.
   * Repeated option-bearing attachments must have non-equivalent options,
   * checked during codegen and registration. Put a provider before middleware
   * that consumes its services.
   *
   * @category Combinators
   *
   * @param middlewareSpec - A Confect middleware covering this function's kind.
   * @param options - The required attachment value, or no argument for a policy
   *   without options.
   *
   * @returns A new builder with the attachment; this builder is unchanged.
   *
   * @throws For a plain Convex function, an unsupported function kind, or a
   *   duplicate middleware key without an options schema.
   */
  middleware<MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec>(
    middlewareSpec: MiddlewareSpec_ &
      MiddlewareSpec.ValidateFunctionAttach<
        MiddlewareSpec_,
        RuntimeAndFunctionType_,
        FunctionProvenance_,
        MiddlewareSpecs_
      >,
    ...options: MiddlewareAttachment.Args<NoInfer<MiddlewareSpec_>>
  ): Builder<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Name_,
    FunctionProvenance_,
    MiddlewareSpecs_ | MiddlewareSpec_
  >;
}

/**
 * @internal
 */
export interface Any {
  readonly [TypeId]: TypeId;
}

/**
 * @internal
 */
export interface AnyWithProps extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance.FunctionProvenance,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

/**
 * @internal
 */
export interface AnyConfect extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance.AnyConfect,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

/**
 * @internal
 */
export interface AnyConvex extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance.AnyConvex,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

/**
 * @internal
 */
export interface AnyWithPropsWithRuntime<
  Runtime extends RuntimeAndFunctionType.Runtime,
> extends FunctionSpec<
  RuntimeAndFunctionType.WithRuntime<Runtime>,
  FunctionVisibility,
  string,
  FunctionProvenance.FunctionProvenance,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

/**
 * @internal
 */
export interface AnyWithPropsWithFunctionType<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
> extends FunctionSpec<
  RuntimeAndFunctionType_,
  FunctionVisibility,
  string,
  FunctionProvenance.FunctionProvenance,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

/**
 * @internal
 */
export interface AnyWithPropsWithFunctionProvenance<
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
> extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance_,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

/**
 * @internal
 */
export type GetRuntimeAndFunctionType<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_["runtimeAndFunctionType"];

/**
 * @internal
 */
export type GetFunctionVisibility<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_["functionVisibility"];

/**
 * @internal
 */
export type GetFunctionProvenance<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_["functionProvenance"];

/**
 * @internal
 */
export type Name<FunctionSpec_ extends AnyWithProps> = FunctionSpec_["name"];

/**
 * @internal
 */
export type MiddlewareSpecs<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_["middlewareSpecs"][number];

/**
 * The field map declared by a Confect-provenance spec.
 *
 * @internal
 */
export type ArgsFields<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    readonly functionProvenance: {
      readonly _tag: "Confect";
      readonly "~ArgsFields": infer ArgsFields_ extends
        FunctionProvenance.ArgsFields;
    };
  }
    ? ArgsFields_
    : FunctionSpec_ extends {
          readonly functionProvenance: { readonly _tag: "Confect" };
        }
      ? FunctionProvenance.ArgsFields
      : never;

/**
 * The args schema assembled from a Confect-provenance spec's field map.
 *
 * @internal
 */
export type ArgsSchema<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    readonly functionProvenance: {
      readonly _tag: "Confect";
      readonly "~ArgsFields": infer ArgsFields_ extends
        FunctionProvenance.ArgsFields;
    };
  }
    ? Schema.Struct<ArgsFields_>
    : FunctionSpec_ extends {
          readonly functionProvenance: {
            readonly _tag: "Confect";
            readonly args: infer ArgsSchema_ extends
              FunctionProvenance.AnyArgsSchema;
          };
        }
      ? ArgsSchema_
      : never;

/**
 * @internal
 */
export type ReturnsSchema<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    readonly functionProvenance: {
      readonly _tag: "Confect";
      readonly returns: infer ReturnsSchema_ extends Schema.Codec<any, any>;
    };
  }
    ? ReturnsSchema_
    : never;

/**
 * @internal
 */
export type ErrorSchema<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    readonly functionProvenance: {
      readonly _tag: "Confect";
      readonly error?: infer ErrorSchema_;
    };
  }
    ? Extract<ErrorSchema_, Schema.Codec<any, any>>
    : never;

/**
 * @internal
 */
export type Args<FunctionSpec_ extends AnyWithProps> = FunctionSpec_ extends {
  readonly functionProvenance: { readonly _tag: "Confect" };
}
  ? ArgsSchema<FunctionSpec_>["Type"]
  : GetFunctionProvenance<FunctionSpec_> extends FunctionProvenance.Convex<
        infer Args_,
        any
      >
    ? Args_
    : never;

/**
 * @internal
 */
export type Returns<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    readonly functionProvenance: { readonly _tag: "Confect" };
  }
    ? ReturnsSchema<FunctionSpec_>["Type"]
    : GetFunctionProvenance<FunctionSpec_> extends FunctionProvenance.Convex<
          any,
          infer Returns_
        >
      ? Awaited<Returns_>
      : never;

/**
 * @internal
 */
export type EncodedArgs<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    readonly functionProvenance: { readonly _tag: "Confect" };
  }
    ? ArgsSchema<FunctionSpec_>["Encoded"]
    : GetFunctionProvenance<FunctionSpec_> extends FunctionProvenance.Convex<
          infer Args_,
          any
        >
      ? Args_
      : never;

/**
 * @internal
 */
export type EncodedReturns<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    readonly functionProvenance: { readonly _tag: "Confect" };
  }
    ? ReturnsSchema<FunctionSpec_>["Encoded"]
    : GetFunctionProvenance<FunctionSpec_> extends FunctionProvenance.Convex<
          any,
          infer Returns_
        >
      ? Returns_
      : never;

/**
 * @internal
 */
export type Error<FunctionSpec_ extends AnyWithProps> =
  ErrorSchema<FunctionSpec_>["Type"];

/**
 * @internal
 */
export type EncodedError<FunctionSpec_ extends AnyWithProps> =
  ErrorSchema<FunctionSpec_>["Encoded"];

/**
 * @internal
 */
export type WithName<
  FunctionSpec_ extends AnyWithProps,
  Name_ extends string,
> = Extract<FunctionSpec_, { readonly name: Name_ }>;

/**
 * @internal
 */
export type WithRuntimeAndFunctionType<
  FunctionSpec_ extends AnyWithProps,
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
> = Extract<
  FunctionSpec_,
  { readonly runtimeAndFunctionType: RuntimeAndFunctionType_ }
>;

/**
 * @internal
 */
export type WithFunctionType<
  FunctionSpec_ extends AnyWithProps,
  FunctionType_ extends FunctionType,
> = Extract<
  FunctionSpec_,
  { readonly runtimeAndFunctionType: { readonly functionType: FunctionType_ } }
>;

/**
 * @internal
 */
export type WithFunctionProvenance<
  FunctionSpec_ extends AnyWithProps,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
> = Extract<
  FunctionSpec_,
  { readonly functionProvenance: FunctionProvenance_ }
>;

/**
 * @internal
 */
export type WithoutName<
  FunctionSpec_ extends AnyWithProps,
  Name_ extends Name<FunctionSpec_>,
> = Exclude<FunctionSpec_, { readonly name: Name_ }>;

const Proto = {
  [TypeId]: TypeId,

  get middlewareSpecs() {
    return Array.map(this.middlewareAttachments, ({ spec }) => spec);
  },

  middleware(
    this: AnyWithProps,
    middlewareSpec: MiddlewareSpec.AnyMiddlewareSpec,
    ...options: ReadonlyArray<unknown>
  ) {
    if (this.functionProvenance._tag === "Convex") {
      throw new Error(
        `Plain Convex function "${this.name}" cannot have middleware`,
      );
    }
    const functionType = this.runtimeAndFunctionType.functionType;
    if (!middlewareSpec.functionTypes[functionType]) {
      throw new Error(
        `Middleware "${middlewareSpec.key}" does not declare function type "${functionType}" of function "${this.name}"`,
      );
    }
    if (
      !("options" in middlewareSpec) &&
      Array.some(
        this.middlewareAttachments,
        ({ spec }) => spec.key === middlewareSpec.key,
      )
    ) {
      throw new Error(
        `Middleware "${middlewareSpec.key}" is already attached to function "${this.name}"`,
      );
    }

    return Object.assign(Object.create(Proto), {
      runtimeAndFunctionType: this.runtimeAndFunctionType,
      functionVisibility: this.functionVisibility,
      name: this.name,
      functionProvenance: this.functionProvenance,
      middlewareAttachments: [
        ...this.middlewareAttachments,
        { spec: middlewareSpec, options: options[0] },
      ],
    });
  },
} satisfies ThisType<AnyWithProps>;

interface Options {
  readonly name: string;
  readonly args?: () => FunctionProvenance.ArgsFields;
  readonly returns: () => Schema.Codec<any, any>;
  readonly error?: () => Schema.Codec<any, any>;
}

const make = <
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
>(
  runtimeAndFunctionType: RuntimeAndFunctionType_,
  functionVisibility: FunctionVisibility_,
) => {
  function makeSpec<
    const Name_ extends string,
    const ArgsFields_ extends FunctionProvenance.ArgsFields,
    Returns_ extends Schema.Codec<any, any>,
    Error_ extends Schema.Codec<any, any> = never,
  >(options: {
    name: Name_;
    args: () => ArgsFields_;
    returns: () => Returns_;
    error?: () => Error_;
  }): Builder<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Name_,
    FunctionProvenance.Confect<ArgsFields_, Returns_, Error_>
  >;
  function makeSpec<
    const Name_ extends string,
    Returns_ extends Schema.Codec<any, any>,
    Error_ extends Schema.Codec<any, any> = never,
  >(options: {
    name: Name_;
    args?: never;
    returns: () => Returns_;
    error?: () => Error_;
  }): Builder<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Name_,
    FunctionProvenance.Confect<{}, Returns_, Error_>
  >;
  function makeSpec({ name, args, returns, error }: Options) {
    validateConfectFunctionIdentifier(name);

    return Object.assign(Object.create(Proto), {
      runtimeAndFunctionType,
      functionVisibility,
      name,
      functionProvenance:
        args === undefined
          ? FunctionProvenance.Confect(() => ({}), returns, error)
          : FunctionProvenance.Confect(args, returns, error),
      middlewareAttachments: [],
    });
  }

  return makeSpec;
};

/**
 * `Schema.Struct` fields that must not declare `paginationOpts`. Used to reject
 * a user args schema that redeclares the field the paginated constructors add
 * themselves; the check reports at the `args` thunk with an unsatisfiable type
 * when violated.
 */
type ForbidPaginationOpts<
  UserArgsFields extends FunctionProvenance.ArgsFields,
> = "paginationOpts" extends keyof UserArgsFields
  ? { readonly paginationOpts: never }
  : unknown;

interface PaginatedOptions {
  readonly name: string;
  readonly args?: () => FunctionProvenance.ArgsFields;
  readonly item: () => Schema.Codec<any, any>;
  readonly error?: () => Schema.Codec<any, any>;
}

const makePaginated = <
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
>(
  runtimeAndFunctionType: RuntimeAndFunctionType_,
  functionVisibility: FunctionVisibility_,
) => {
  function makeSpec<
    const Name_ extends string,
    const UserArgsFields_ extends FunctionProvenance.ArgsFields,
    Item_ extends Schema.Codec<any, any>,
    Error_ extends Schema.Codec<any, any> = never,
  >(options: {
    name: Name_;
    args: () => UserArgsFields_ & ForbidPaginationOpts<UserArgsFields_>;
    item: () => Item_;
    error?: () => Error_;
  }): Builder<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Name_,
    FunctionProvenance.ConfectPaginated<UserArgsFields_, Item_, Error_>
  >;
  function makeSpec<
    const Name_ extends string,
    Item_ extends Schema.Codec<any, any>,
    Error_ extends Schema.Codec<any, any> = never,
  >(options: {
    name: Name_;
    args?: never;
    item: () => Item_;
    error?: () => Error_;
  }): Builder<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Name_,
    FunctionProvenance.ConfectPaginated<{}, Item_, Error_>
  >;
  function makeSpec({ name, args, item, error }: PaginatedOptions) {
    validateConfectFunctionIdentifier(name);

    return Object.assign(Object.create(Proto), {
      runtimeAndFunctionType,
      functionVisibility,
      name,
      functionProvenance:
        args === undefined
          ? FunctionProvenance.ConfectPaginated(() => ({}), item, error)
          : FunctionProvenance.ConfectPaginated(args, item, error),
      middlewareAttachments: [],
    });
  }

  return makeSpec;
};

/**
 * Declare a public query in the Convex runtime. Clients can subscribe to this
 * query or call it directly.
 *
 * Schema factories are evaluated lazily. Codecs must require no decoding or
 * encoding services and must encode to Convex values.
 *
 * @category Constructors
 *
 * @example
 *   import { FunctionSpec } from "@confect/core";
 *   import * as Schema from "effect/Schema";
 *
 *   const greet = FunctionSpec.publicQuery({
 *     name: "greet",
 *     args: () => ({ name: Schema.String }),
 *     returns: () => Schema.String,
 *   });
 *
 * @param options - The function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - A lazy `Schema.Struct` field map, not a schema; omit
 *   for no arguments.
 * @param options.returns - A lazy result codec; use `Schema.Null` for no
 *   result.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A new function builder that can be added to a group.
 *
 * @throws If the name is invalid or reserved.
 */
export const publicQuery = make(RuntimeAndFunctionType.ConvexQuery, "public");
/**
 * Declare an internal query in the Convex runtime. Only server-side callers can
 * invoke it; it is not a client endpoint.
 *
 * Schema factories are evaluated lazily. Codecs must require no decoding or
 * encoding services and must encode to Convex values.
 *
 * @category Constructors
 *
 * @param options - The function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - A lazy `Schema.Struct` field map, not a schema; omit
 *   for no arguments.
 * @param options.returns - A lazy result codec; use `Schema.Null` for no
 *   result.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A new function builder that can be added to a group.
 *
 * @throws If the name is invalid or reserved.
 */
export const internalQuery = make(
  RuntimeAndFunctionType.ConvexQuery,
  "internal",
);
/**
 * Declare a public paginated query from an item codec. Use its generated ref
 * with a paginated client query.
 *
 * Confect adds `paginationOpts` to the handler's args and wraps `item` in a
 * pagination-result codec. All factories are lazy; codecs must require no
 * services and encode to Convex values.
 *
 * @category Constructors
 *
 * @param options - The paginated function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - Optional lazy user-argument fields; must not include
 *   `paginationOpts`.
 * @param options.item - A lazy codec for one item in the returned page.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A query builder whose handler returns a page with cursors and
 *   completion status.
 *
 * @throws For an invalid or reserved name, or when composing args that
 *   redeclare `paginationOpts`.
 */
export const publicPaginatedQuery = makePaginated(
  RuntimeAndFunctionType.ConvexQuery,
  "public",
);
/**
 * Declare an internal paginated query from an item codec. Only server-side
 * callers can invoke it; it is not a client endpoint.
 *
 * Confect adds `paginationOpts` to the handler's args and wraps `item` in a
 * pagination-result codec. All factories are lazy; codecs must require no
 * services and encode to Convex values.
 *
 * @category Constructors
 *
 * @param options - The paginated function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - Optional lazy user-argument fields; must not include
 *   `paginationOpts`.
 * @param options.item - A lazy codec for one item in the returned page.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A query builder whose handler returns a page with cursors and
 *   completion status.
 *
 * @throws For an invalid or reserved name, or when composing args that
 *   redeclare `paginationOpts`.
 */
export const internalPaginatedQuery = makePaginated(
  RuntimeAndFunctionType.ConvexQuery,
  "internal",
);
/**
 * Declare a public mutation in the Convex runtime. Clients can invoke it to
 * perform a transaction.
 *
 * Schema factories are evaluated lazily. Codecs must require no decoding or
 * encoding services and must encode to Convex values.
 *
 * @category Constructors
 *
 * @param options - The function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - A lazy `Schema.Struct` field map, not a schema; omit
 *   for no arguments.
 * @param options.returns - A lazy result codec; use `Schema.Null` for no
 *   result.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A new function builder that can be added to a group.
 *
 * @throws If the name is invalid or reserved.
 */
export const publicMutation = make(
  RuntimeAndFunctionType.ConvexMutation,
  "public",
);
/**
 * Declare an internal mutation in the Convex runtime. Only server-side callers
 * can invoke this transaction.
 *
 * Schema factories are evaluated lazily. Codecs must require no decoding or
 * encoding services and must encode to Convex values.
 *
 * @category Constructors
 *
 * @param options - The function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - A lazy `Schema.Struct` field map, not a schema; omit
 *   for no arguments.
 * @param options.returns - A lazy result codec; use `Schema.Null` for no
 *   result.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A new function builder that can be added to a group.
 *
 * @throws If the name is invalid or reserved.
 */
export const internalMutation = make(
  RuntimeAndFunctionType.ConvexMutation,
  "internal",
);
/**
 * Declare a public action in the Convex runtime. Clients can invoke it for work
 * outside a database transaction.
 *
 * Schema factories are evaluated lazily. Codecs must require no decoding or
 * encoding services and must encode to Convex values.
 *
 * @category Constructors
 *
 * @param options - The function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - A lazy `Schema.Struct` field map, not a schema; omit
 *   for no arguments.
 * @param options.returns - A lazy result codec; use `Schema.Null` for no
 *   result.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A new function builder that can be added to a group.
 *
 * @throws If the name is invalid or reserved.
 */
export const publicAction = make(RuntimeAndFunctionType.ConvexAction, "public");
/**
 * Declare an internal action in the Convex runtime. Only server-side callers
 * can invoke this non-transactional function.
 *
 * Schema factories are evaluated lazily. Codecs must require no decoding or
 * encoding services and must encode to Convex values.
 *
 * @category Constructors
 *
 * @param options - The function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - A lazy `Schema.Struct` field map, not a schema; omit
 *   for no arguments.
 * @param options.returns - A lazy result codec; use `Schema.Null` for no
 *   result.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A new function builder that can be added to a group.
 *
 * @throws If the name is invalid or reserved.
 */
export const internalAction = make(
  RuntimeAndFunctionType.ConvexAction,
  "internal",
);

/**
 * Declare a public Node.js action in the Node.js runtime. Add it to a group
 * created with `GroupSpec.makeNode()`.
 *
 * Schema factories are evaluated lazily. Codecs must require no decoding or
 * encoding services and must encode to Convex values.
 *
 * @category Constructors
 *
 * @param options - The function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - A lazy `Schema.Struct` field map, not a schema; omit
 *   for no arguments.
 * @param options.returns - A lazy result codec; use `Schema.Null` for no
 *   result.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A new function builder that can be added to a group.
 *
 * @throws If the name is invalid or reserved.
 */
export const publicNodeAction = make(
  RuntimeAndFunctionType.NodeAction,
  "public",
);
/**
 * Declare an internal Node.js action in the Node.js runtime. Only server-side
 * callers can invoke it. Add it to `GroupSpec.makeNode()`.
 *
 * Schema factories are evaluated lazily. Codecs must require no decoding or
 * encoding services and must encode to Convex values.
 *
 * @category Constructors
 *
 * @param options - The function declaration.
 * @param options.name - A non-reserved JavaScript identifier, local to its
 *   group.
 * @param options.args - A lazy `Schema.Struct` field map, not a schema; omit
 *   for no arguments.
 * @param options.returns - A lazy result codec; use `Schema.Null` for no
 *   result.
 * @param options.error - An optional lazy codec for typed handler failures.
 *
 * @returns A new function builder that can be added to a group.
 *
 * @throws If the name is invalid or reserved.
 */
export const internalNodeAction = make(
  RuntimeAndFunctionType.NodeAction,
  "internal",
);

type MatchingRegisteredFunction<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
> =
  RuntimeAndFunctionType.GetFunctionType<RuntimeAndFunctionType_> extends "query"
    ? RegisteredQuery<FunctionVisibility_, any, any>
    : RuntimeAndFunctionType.GetFunctionType<RuntimeAndFunctionType_> extends "mutation"
      ? RegisteredMutation<FunctionVisibility_, any, any>
      : RuntimeAndFunctionType.GetFunctionType<RuntimeAndFunctionType_> extends "action"
        ? RegisteredAction<FunctionVisibility_, any, any>
        : never;

type ExtractArgs<F> =
  F extends RegisteredQuery<any, infer A extends DefaultFunctionArgs, any>
    ? A
    : F extends RegisteredMutation<
          any,
          infer A extends DefaultFunctionArgs,
          any
        >
      ? A
      : F extends RegisteredAction<
            any,
            infer A extends DefaultFunctionArgs,
            any
          >
        ? A
        : never;

type ExtractReturns<F> =
  F extends RegisteredQuery<any, any, infer R>
    ? R
    : F extends RegisteredMutation<any, any, infer R>
      ? R
      : F extends RegisteredAction<any, any, infer R>
        ? R
        : never;

const makeConvex =
  <
    RuntimeAndFunctionType_ extends
      RuntimeAndFunctionType.RuntimeAndFunctionType,
    FunctionVisibility_ extends FunctionVisibility,
  >(
    runtimeAndFunctionType: RuntimeAndFunctionType_,
    functionVisibility: FunctionVisibility_,
  ) =>
  <
    F extends MatchingRegisteredFunction<
      RuntimeAndFunctionType_,
      FunctionVisibility_
    >,
  >() =>
  <const Name_ extends string>(
    name: Name_,
  ): Builder<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Name_,
    FunctionProvenance.Convex<ExtractArgs<F>, ExtractReturns<F>>
  > => {
    validateConfectFunctionIdentifier(name);

    return Object.assign(Object.create(Proto), {
      runtimeAndFunctionType,
      functionVisibility,
      name,
      functionProvenance: FunctionProvenance.Convex<
        ExtractArgs<F>,
        ExtractReturns<F>
      >(),
      middlewareAttachments: [],
    }) as any;
  };

/**
 * Declare a public query implemented by an existing registered Convex function.
 * Call `convexPublicQuery<typeof registeredFunction>()("name")` to infer its
 * argument and return types; the registered function must match this type and
 * visibility.
 *
 * The handler is passed through unchanged: no Effect codecs or Confect
 * middleware are applied. Supply it with `FunctionImpl.make` in the impl
 * module. The resulting function is available to clients.
 *
 * @category Constructors
 *
 * @returns A name-taking factory that creates the function builder.
 *
 * @throws If the supplied name is invalid or reserved.
 */
export const convexPublicQuery = makeConvex(
  RuntimeAndFunctionType.ConvexQuery,
  "public",
);
/**
 * Declare an internal query implemented by an existing registered Convex
 * function. Call `convexInternalQuery<typeof registeredFunction>()("name")` to
 * infer its argument and return types; the registered function must match this
 * type and visibility.
 *
 * The handler is passed through unchanged: no Effect codecs or Confect
 * middleware are applied. Supply it with `FunctionImpl.make` in the impl
 * module. The resulting function is available only to server-side callers.
 *
 * @category Constructors
 *
 * @returns A name-taking factory that creates the function builder.
 *
 * @throws If the supplied name is invalid or reserved.
 */
export const convexInternalQuery = makeConvex(
  RuntimeAndFunctionType.ConvexQuery,
  "internal",
);
/**
 * Declare a public mutation implemented by an existing registered Convex
 * function. Call `convexPublicMutation<typeof registeredFunction>()("name")` to
 * infer its argument and return types; the registered function must match this
 * type and visibility.
 *
 * The handler is passed through unchanged: no Effect codecs or Confect
 * middleware are applied. Supply it with `FunctionImpl.make` in the impl
 * module. The resulting function is available to clients.
 *
 * @category Constructors
 *
 * @returns A name-taking factory that creates the function builder.
 *
 * @throws If the supplied name is invalid or reserved.
 */
export const convexPublicMutation = makeConvex(
  RuntimeAndFunctionType.ConvexMutation,
  "public",
);
/**
 * Declare an internal mutation implemented by an existing registered Convex
 * function. Call `convexInternalMutation<typeof registeredFunction>()("name")`
 * to infer its argument and return types; the registered function must match
 * this type and visibility.
 *
 * The handler is passed through unchanged: no Effect codecs or Confect
 * middleware are applied. Supply it with `FunctionImpl.make` in the impl
 * module. The resulting function is available only to server-side callers.
 *
 * @category Constructors
 *
 * @returns A name-taking factory that creates the function builder.
 *
 * @throws If the supplied name is invalid or reserved.
 */
export const convexInternalMutation = makeConvex(
  RuntimeAndFunctionType.ConvexMutation,
  "internal",
);
/**
 * Declare a public action implemented by an existing registered Convex
 * function. Call `convexPublicAction<typeof registeredFunction>()("name")` to
 * infer its argument and return types; the registered function must match this
 * type and visibility.
 *
 * The handler is passed through unchanged: no Effect codecs or Confect
 * middleware are applied. Supply it with `FunctionImpl.make` in the impl
 * module. The resulting function is available to clients.
 *
 * @category Constructors
 *
 * @returns A name-taking factory that creates the function builder.
 *
 * @throws If the supplied name is invalid or reserved.
 */
export const convexPublicAction = makeConvex(
  RuntimeAndFunctionType.ConvexAction,
  "public",
);
/**
 * Declare an internal action implemented by an existing registered Convex
 * function. Call `convexInternalAction<typeof registeredFunction>()("name")` to
 * infer its argument and return types; the registered function must match this
 * type and visibility.
 *
 * The handler is passed through unchanged: no Effect codecs or Confect
 * middleware are applied. Supply it with `FunctionImpl.make` in the impl
 * module. The resulting function is available only to server-side callers.
 *
 * @category Constructors
 *
 * @returns A name-taking factory that creates the function builder.
 *
 * @throws If the supplied name is invalid or reserved.
 */
export const convexInternalAction = makeConvex(
  RuntimeAndFunctionType.ConvexAction,
  "internal",
);
/**
 * Declare a public Node.js action implemented by an existing registered Convex
 * function. Call `convexPublicNodeAction<typeof registeredFunction>()("name")`
 * to infer its argument and return types; the registered function must match
 * this type and visibility.
 *
 * The handler is passed through unchanged: no Effect codecs or Confect
 * middleware are applied. Supply it with `FunctionImpl.make` in the impl
 * module. Add the spec to a group created with `GroupSpec.makeNode()`.
 *
 * @category Constructors
 *
 * @returns A name-taking factory that creates the function builder.
 *
 * @throws If the supplied name is invalid or reserved.
 */
export const convexPublicNodeAction = makeConvex(
  RuntimeAndFunctionType.NodeAction,
  "public",
);
/**
 * Declare an internal Node.js action implemented by an existing registered
 * Convex function. Call `convexInternalNodeAction<typeof
 * registeredFunction>()("name")` to infer its argument and return types; the
 * registered function must match this type and visibility.
 *
 * The handler is passed through unchanged: no Effect codecs or Confect
 * middleware are applied. Supply it with `FunctionImpl.make` in the impl
 * module. Add the spec to a group created with `GroupSpec.makeNode()`.
 *
 * @category Constructors
 *
 * @returns A name-taking factory that creates the function builder.
 *
 * @throws If the supplied name is invalid or reserved.
 */
export const convexInternalNodeAction = makeConvex(
  RuntimeAndFunctionType.NodeAction,
  "internal",
);
