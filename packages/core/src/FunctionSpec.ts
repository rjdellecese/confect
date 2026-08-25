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

export const TypeId = "~@confect/core/FunctionSpec";
export type TypeId = typeof TypeId;

export const isFunctionSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export interface FunctionSpec<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Name_ extends string,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
  MiddlewareSpecs_ extends MiddlewareSpec.AnyMiddlewareSpec = never,
> {
  readonly [TypeId]: TypeId;
  readonly runtimeAndFunctionType: RuntimeAndFunctionType_;
  readonly functionVisibility: FunctionVisibility_;
  readonly name: Name_;
  readonly functionProvenance: FunctionProvenance_;
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpecs_>;
}

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
  middleware<MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec>(
    middlewareSpec: MiddlewareSpec_ &
      MiddlewareSpec.ValidateFunctionAttach<
        MiddlewareSpec_,
        RuntimeAndFunctionType_,
        FunctionProvenance_,
        MiddlewareSpecs_
      >,
  ): Builder<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Name_,
    FunctionProvenance_,
    MiddlewareSpecs_ | MiddlewareSpec_
  >;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance.FunctionProvenance,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

export interface AnyConfect extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance.AnyConfect,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

export interface AnyConvex extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance.AnyConvex,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

export interface AnyWithPropsWithRuntime<
  Runtime extends RuntimeAndFunctionType.Runtime,
> extends FunctionSpec<
  RuntimeAndFunctionType.WithRuntime<Runtime>,
  FunctionVisibility,
  string,
  FunctionProvenance.FunctionProvenance,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

export interface AnyWithPropsWithFunctionType<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
> extends FunctionSpec<
  RuntimeAndFunctionType_,
  FunctionVisibility,
  string,
  FunctionProvenance.FunctionProvenance,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

export interface AnyWithPropsWithFunctionProvenance<
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
> extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance_,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

export type GetRuntimeAndFunctionType<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_["runtimeAndFunctionType"];

export type GetFunctionVisibility<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_["functionVisibility"];

export type Name<FunctionSpec_ extends AnyWithProps> = FunctionSpec_["name"];

export type MiddlewareSpecs<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_["middlewareSpecs"][number];

/** The field map declared by a Confect-provenance spec. */
export type ArgsFields<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    functionProvenance: {
      readonly _tag: "Confect";
      readonly "~ArgsFields": infer ArgsFields_ extends
        FunctionProvenance.ArgsFields;
    };
  }
    ? ArgsFields_
    : FunctionSpec_ extends {
          functionProvenance: { readonly _tag: "Confect" };
        }
      ? FunctionProvenance.ArgsFields
      : never;

/** The args schema assembled from a Confect-provenance spec's field map. */
export type ArgsSchema<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    functionProvenance: {
      readonly _tag: "Confect";
      readonly "~ArgsFields": infer ArgsFields_ extends
        FunctionProvenance.ArgsFields;
    };
  }
    ? Schema.Struct<ArgsFields_>
    : FunctionSpec_ extends {
          functionProvenance: {
            readonly _tag: "Confect";
            readonly args: infer ArgsSchema_ extends FunctionProvenance.AnyArgs;
          };
        }
      ? ArgsSchema_
      : never;

export type ReturnsSchema<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    functionProvenance: FunctionProvenance.Confect<
      any,
      infer ReturnsSchema_ extends Schema.Codec<any, any>,
      any,
      any
    >;
  }
    ? ReturnsSchema_
    : never;

export type ErrorSchema<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    functionProvenance: FunctionProvenance.Confect<
      any,
      any,
      infer ErrorSchema_ extends Schema.Codec<any, any>,
      any
    >;
  }
    ? ErrorSchema_
    : never;

export type Args<FunctionSpec_ extends AnyWithProps> = FunctionSpec_ extends {
  functionProvenance: {
    readonly _tag: "Confect";
    readonly "~ArgsFields": infer ArgsFields_ extends
      FunctionProvenance.ArgsFields;
  };
}
  ? Schema.Struct.Type<ArgsFields_>
  : FunctionSpec_ extends {
        functionProvenance: {
          _tag: "Confect";
          args: infer ArgsSchema_ extends Schema.Codec<any, any>;
        };
      }
    ? ArgsSchema_["Type"]
    : FunctionSpec_ extends {
          functionProvenance: { _tag: "Convex"; "~args": infer Args_ };
        }
      ? Args_
      : never;

export type Returns<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    functionProvenance: {
      _tag: "Confect";
      returns: infer ReturnsSchema_ extends Schema.Codec<any, any>;
    };
  }
    ? ReturnsSchema_["Type"]
    : FunctionSpec_ extends {
          functionProvenance: { _tag: "Convex"; "~returns": infer Returns_ };
        }
      ? Awaited<Returns_>
      : never;

export type EncodedArgs<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    functionProvenance: {
      readonly _tag: "Confect";
      readonly "~ArgsFields": infer ArgsFields_ extends
        FunctionProvenance.ArgsFields;
    };
  }
    ? Schema.Struct.Encoded<ArgsFields_>
    : FunctionSpec_ extends {
          functionProvenance: {
            _tag: "Confect";
            args: infer ArgsSchema_ extends Schema.Codec<any, any>;
          };
        }
      ? ArgsSchema_["Encoded"]
      : FunctionSpec_ extends {
            functionProvenance: { _tag: "Convex"; "~args": infer Args_ };
          }
        ? Args_
        : never;

export type EncodedReturns<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    functionProvenance: {
      _tag: "Confect";
      returns: infer ReturnsSchema_ extends Schema.Codec<any, any>;
    };
  }
    ? ReturnsSchema_["Encoded"]
    : FunctionSpec_ extends {
          functionProvenance: { _tag: "Convex"; "~returns": infer Returns_ };
        }
      ? Returns_
      : never;

export type Error<FunctionSpec_ extends AnyWithProps> = FunctionSpec_ extends {
  functionProvenance: FunctionProvenance.Confect<
    any,
    any,
    infer ErrorSchema_ extends Schema.Codec<any, any>
  >;
}
  ? ErrorSchema_["Type"]
  : never;

export type EncodedError<FunctionSpec_ extends AnyWithProps> =
  FunctionSpec_ extends {
    functionProvenance: FunctionProvenance.Confect<
      any,
      any,
      infer ErrorSchema_ extends Schema.Codec<any, any>
    >;
  }
    ? ErrorSchema_["Encoded"]
    : never;

export type WithName<
  FunctionSpec_ extends AnyWithProps,
  Name_ extends string,
> = Extract<FunctionSpec_, { readonly name: Name_ }>;

export type WithRuntimeAndFunctionType<
  FunctionSpec_ extends AnyWithProps,
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
> = Extract<
  FunctionSpec_,
  { readonly runtimeAndFunctionType: RuntimeAndFunctionType_ }
>;

export type WithFunctionType<
  FunctionSpec_ extends AnyWithProps,
  FunctionType_ extends FunctionType,
> = Extract<
  FunctionSpec_,
  { readonly runtimeAndFunctionType: { readonly functionType: FunctionType_ } }
>;

export type WithFunctionProvenance<
  FunctionSpec_ extends AnyWithProps,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
> = Extract<
  FunctionSpec_,
  { readonly functionProvenance: FunctionProvenance_ }
>;

export type WithoutName<
  FunctionSpec_ extends AnyWithProps,
  Name_ extends Name<FunctionSpec_>,
> = Exclude<FunctionSpec_, { readonly name: Name_ }>;

const Proto = {
  [TypeId]: TypeId,

  middleware(
    this: AnyWithProps,
    middlewareSpec: MiddlewareSpec.AnyMiddlewareSpec,
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
      this.middlewareSpecs.some(
        (existing) => existing.key === middlewareSpec.key,
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
      middlewareSpecs: [...this.middlewareSpecs, middlewareSpec],
    });
  },
};

interface AnyOptions {
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
  function makeSpec({ name, args, returns, error }: AnyOptions) {
    validateConfectFunctionIdentifier(name);

    return Object.assign(Object.create(Proto), {
      runtimeAndFunctionType,
      functionVisibility,
      name,
      functionProvenance:
        args === undefined
          ? FunctionProvenance.Confect(() => ({}), returns, error)
          : FunctionProvenance.Confect(args, returns, error),
      middlewareSpecs: [],
    });
  }

  return makeSpec;
};

/**
 * `Schema.Struct` fields that must not declare `paginationOpts`. Used to
 * reject a user args schema that redeclares the field the paginated
 * constructors add themselves; the check reports at the `args` thunk with an
 * unsatisfiable type when violated.
 */
type ForbidPaginationOpts<
  UserArgsFields extends FunctionProvenance.ArgsFields,
> = "paginationOpts" extends keyof UserArgsFields
  ? { readonly paginationOpts: never }
  : unknown;

interface AnyPaginatedOptions {
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
  function makeSpec({ name, args, item, error }: AnyPaginatedOptions) {
    validateConfectFunctionIdentifier(name);

    return Object.assign(Object.create(Proto), {
      runtimeAndFunctionType,
      functionVisibility,
      name,
      functionProvenance:
        args === undefined
          ? FunctionProvenance.ConfectPaginated(() => ({}), item, error)
          : FunctionProvenance.ConfectPaginated(args, item, error),
      middlewareSpecs: [],
    });
  }

  return makeSpec;
};

export const publicQuery = make(RuntimeAndFunctionType.ConvexQuery, "public");
export const internalQuery = make(
  RuntimeAndFunctionType.ConvexQuery,
  "internal",
);
export const publicPaginatedQuery = makePaginated(
  RuntimeAndFunctionType.ConvexQuery,
  "public",
);
export const internalPaginatedQuery = makePaginated(
  RuntimeAndFunctionType.ConvexQuery,
  "internal",
);
export const publicMutation = make(
  RuntimeAndFunctionType.ConvexMutation,
  "public",
);
export const internalMutation = make(
  RuntimeAndFunctionType.ConvexMutation,
  "internal",
);
export const publicAction = make(RuntimeAndFunctionType.ConvexAction, "public");
export const internalAction = make(
  RuntimeAndFunctionType.ConvexAction,
  "internal",
);

export const publicNodeAction = make(
  RuntimeAndFunctionType.NodeAction,
  "public",
);
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
      middlewareSpecs: [],
    }) as any;
  };

export const convexPublicQuery = makeConvex(
  RuntimeAndFunctionType.ConvexQuery,
  "public",
);
export const convexInternalQuery = makeConvex(
  RuntimeAndFunctionType.ConvexQuery,
  "internal",
);
export const convexPublicMutation = makeConvex(
  RuntimeAndFunctionType.ConvexMutation,
  "public",
);
export const convexInternalMutation = makeConvex(
  RuntimeAndFunctionType.ConvexMutation,
  "internal",
);
export const convexPublicAction = makeConvex(
  RuntimeAndFunctionType.ConvexAction,
  "public",
);
export const convexInternalAction = makeConvex(
  RuntimeAndFunctionType.ConvexAction,
  "internal",
);
export const convexPublicNodeAction = makeConvex(
  RuntimeAndFunctionType.NodeAction,
  "public",
);
export const convexInternalNodeAction = makeConvex(
  RuntimeAndFunctionType.NodeAction,
  "internal",
);
