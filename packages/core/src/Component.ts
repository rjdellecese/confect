import type { DefaultFunctionArgs, FunctionReference } from "convex/server";
import { getFunctionAddress } from "convex/server";
import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import type * as FunctionSpec from "./FunctionSpec";
import * as GenericId from "./GenericId";
import type * as GroupSpec from "./GroupSpec";
import * as IdScope from "./IdScope";
import * as Ref from "./Ref";
import type * as Refs from "./Refs";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";
import type * as Spec from "./Spec";

const TypeId = "~@confect/core/Component";
const BoundTypeId = "~@confect/core/BoundComponent";

/** Convex's generated ComponentApi erases database ID brands at the boundary. */
type Wire<A> = A extends { readonly __tableName: string }
  ? string
  : A extends
        | string
        | number
        | bigint
        | boolean
        | null
        | undefined
        | ArrayBuffer
    ? A
    : { [K in keyof A]: Wire<A[K]> };

type OmitEmpty<A> = {
  [K in keyof A as keyof A[K] extends never ? never : K]: A[K];
};
type ApiGroups<
  GroupSpec_ extends GroupSpec.AnyWithProps,
  Name extends string | undefined,
> = OmitEmpty<{
  [GroupName in GroupSpec.Name<GroupSpec_>]: ApiGroup<
    GroupSpec.WithName<GroupSpec_, GroupName>,
    Name
  >;
}>;
type ApiGroup<
  GroupSpec_ extends GroupSpec.AnyWithProps,
  Name extends string | undefined,
> = ApiGroups<GroupSpec.Groups<GroupSpec_>, Name> & {
  [
    FunctionSpec_ in GroupSpec.Functions<GroupSpec_> as FunctionSpec.GetFunctionVisibility<FunctionSpec_> extends "public"
      ? FunctionSpec.Name<FunctionSpec_>
      : never
  ]: FunctionReference<
    RuntimeAndFunctionType.GetFunctionType<
      FunctionSpec_["runtimeAndFunctionType"]
    >,
    "internal",
    Extract<Wire<FunctionSpec.EncodedArgs<FunctionSpec_>>, DefaultFunctionArgs>,
    Wire<FunctionSpec.EncodedReturns<FunctionSpec_>>,
    Name
  >;
};

export type Api<
  Spec_ extends Spec.AnyWithProps,
  Name extends string | undefined = string | undefined,
> = ApiGroups<Spec.Groups<Spec_>, Name>;

interface Tree {
  readonly [key: string]: Tree | Ref.Any;
}

export interface Component<
  Spec_ extends Spec.AnyWithProps,
  Scope extends IdScope.IdScope,
  Tables extends string = string,
> {
  readonly [TypeId]: {
    readonly refs: Tree;
    readonly scope: Scope;
    readonly tables: ReadonlyArray<Tables>;
  };
  readonly "~Spec": Spec_;
}

/** An opaque identity: its string representation is not part of the API. */
export type MountScope<
  Parent extends IdScope.IdScope,
  Name extends string | undefined,
> = IdScope.Mount<Parent, Name>;

type MountName<ComponentApi> =
  ComponentApi extends FunctionReference<any, any, any, any, infer Name>
    ? Name
    : ComponentApi extends object
      ? {
          [Key in keyof ComponentApi]: MountName<ComponentApi[Key]>;
        }[keyof ComponentApi]
      : never;

type BindRefs<
  RefTree,
  From extends IdScope.IdScope,
  To extends IdScope.IdScope,
> = RefTree extends Ref.Any
  ? RefTree extends { readonly _tag: "Convex" }
    ? Ref.ConvexRef<
        Ref.GetRuntimeAndFunctionType<RefTree>,
        "internal",
        Extract<Wire<Ref.Args<RefTree>>, DefaultFunctionArgs>,
        Wire<Ref.Returns<RefTree>>
      >
    : Extract<
        Ref.Ref<
          Ref.GetRuntimeAndFunctionType<RefTree>,
          "internal",
          Extract<
            GenericId.Rebase<Ref.Args<RefTree>, From, To>,
            DefaultFunctionArgs
          >,
          GenericId.Rebase<Ref.Returns<RefTree>, From, To>,
          GenericId.Rebase<Ref.Error<RefTree>, From, To>
        >,
        { readonly _tag: RefTree["_tag"] }
      >
  : { [Key in keyof RefTree]: BindRefs<RefTree[Key], From, To> };

export type Bound<
  Spec_ extends Spec.AnyWithProps,
  From extends IdScope.IdScope,
  To extends IdScope.IdScope,
  Tables extends string,
> = BindRefs<Refs.Refs<Spec_, Ref.AnyPublic>, From, To> & {
  readonly [BoundTypeId]: {
    readonly from: From;
    readonly scope: To;
    readonly tables: ReadonlyArray<Tables>;
  };
};

/** Build a publishable contract containing only exported functions and codecs. */
export const make = <
  Spec_ extends Spec.AnyWithProps,
  const Scope extends IdScope.IdScope,
  const Tables extends string,
>(
  spec: Spec_,
  scope: Scope,
  tables: ReadonlyArray<Tables>,
): Component<Spec_, Scope, Tables> => {
  if (scope === "")
    throw new Error(
      "A component contract requires a nonempty definition scope.",
    );
  const collect = (
    groups: Readonly<Record<string, GroupSpec.AnyWithProps>>,
    prefix = "",
  ): Tree =>
    pipe(
      groups,
      Record.map((group, name) => {
        const path = prefix === "" ? name : `${prefix}/${name}`;
        const functions = pipe(
          group.functions,
          Record.filter((functionSpec) => {
            if (Record.has(group.groups, functionSpec.name))
              throw new Error(
                `Group and function at same level have same name ('${path}:${functionSpec.name}')`,
              );
            return functionSpec.functionVisibility === "public";
          }),
          Record.map((functionSpec) =>
            Ref.make(path, functionSpec, group.middlewareSpecs),
          ),
        );
        return { ...collect(group.groups, path), ...functions };
      }),
      Record.filter((children) => !Record.isEmptyRecord(children)),
    );
  return {
    [TypeId]: { refs: collect(spec.groups), scope, tables },
  } as Component<Spec_, Scope, Tables>;
};

/** Bind the published contract to an actual installed component reference. */
export const bind = <
  Spec_ extends Spec.AnyWithProps,
  From extends IdScope.IdScope,
  Tables extends string,
  Native extends Api<NoInfer<Spec_>>,
  const Parent extends IdScope.IdScope = IdScope.App,
>(
  component: Component<Spec_, From, Tables>,
  native: Native,
  options?: { readonly parentScope: Parent },
): Bound<
  Spec_,
  From,
  MountScope<Parent, Extract<MountName<Native>, string | undefined>>,
  Tables
> => {
  const contract = component[TypeId];
  const address = getFunctionAddress(native);
  if (address.reference === undefined)
    throw new Error(
      "Component.bind expects an installed component from the generated components registry.",
    );
  // Preserve the opaque address as an identity only. Calls retain the native
  // references; no component address is constructed or parsed for routing.
  const scope = IdScope.instance(
    options?.parentScope ?? IdScope.app,
    address.reference,
  );
  const rebase = (schema: Schema.ConstraintCodec<any, any, never, never>) =>
    GenericId.rebase(schema, contract.scope, scope);
  const visit = (tree: Tree, references: unknown): Tree =>
    Record.map(tree, (child, key) => {
      const reference = (references as Record<string, unknown>)[key];
      if (Ref.isRef(child)) {
        const ref = child;
        const nativeRef = reference as FunctionReference<any, any>;
        if (ref._tag === "Convex") {
          return { ...ref, functionReference: nativeRef };
        } else {
          return {
            ...ref,
            functionReference: nativeRef,
            args: Schema.Struct(Record.map(ref.args.fields, rebase)),
            returns: rebase(ref.returns),
            kind:
              ref.kind._tag === "Paginated"
                ? {
                    ...ref.kind,
                    userArgs: Schema.Struct(
                      Record.map(ref.kind.userArgs.fields, rebase),
                    ),
                    item: rebase(ref.kind.item),
                    page: rebase(ref.kind.page),
                  }
                : ref.kind,
            middlewareSpecs: Array.map(ref.middlewareSpecs, (middleware) =>
              "error" in middleware
                ? { ...middleware, error: rebase(middleware.error) }
                : middleware,
            ),
            ...("error" in ref && ref.error !== undefined
              ? { error: rebase(ref.error) }
              : {}),
          };
        }
      } else {
        return visit(child, reference);
      }
    });
  const refs = visit(contract.refs, native);
  Object.defineProperty(refs, BoundTypeId, {
    value: { from: contract.scope, scope, tables: contract.tables },
  });
  return refs as Bound<
    Spec_,
    From,
    MountScope<Parent, Extract<MountName<Native>, string | undefined>>,
    Tables
  >;
};

/** Reference an installed component's table ID in host schemas. */
export const id = <
  From extends IdScope.IdScope,
  To extends IdScope.IdScope,
  Tables extends string,
  const Table extends Tables,
>(
  component: {
    readonly [BoundTypeId]: {
      readonly from: From;
      readonly scope: To;
      readonly tables: ReadonlyArray<Tables>;
    };
  },
  table: Table,
) => GenericId.GenericId(table, component[BoundTypeId].scope);

/** Reuse a component's codec in a host function or table without losing its scope. */
export const schema = <
  From extends IdScope.IdScope,
  To extends IdScope.IdScope,
  Schema_ extends Schema.Codec<any, any>,
>(
  component: {
    readonly [BoundTypeId]: { readonly from: From; readonly scope: To };
  },
  codec: Schema_,
) =>
  GenericId.rebase(
    codec,
    component[BoundTypeId].from,
    component[BoundTypeId].scope,
  );
