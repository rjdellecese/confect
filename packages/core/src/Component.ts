/**
 * Publish a component's function contract, bind it to an installed Convex
 * component, and use the resulting refs and ID schemas in its caller.
 */

import type { DefaultFunctionArgs, FunctionReference } from "convex/server";
import { getFunctionAddress } from "convex/server";
import type { GenericId as ConvexId } from "convex/values";
import * as Array from "effect/Array";
import { memoize, pipe } from "effect/Function";
import * as Match from "effect/Match";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import type * as FunctionProvenance from "./FunctionProvenance";
import type * as FunctionSpec from "./FunctionSpec";
import * as GenericId from "./GenericId";
import type * as GroupSpec from "./GroupSpec";
import * as IdScope from "./IdScope";
import * as Lazy from "./Lazy";
import type * as MiddlewareSpec from "./MiddlewareSpec";
import * as Ref from "./Ref";
import type * as Refs from "./Refs";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";
import * as Spec from "./Spec";

const TypeId = "~@confect/core/Component";
const BoundTypeId = "~@confect/core/BoundComponent";
declare const MountNameId: unique symbol;

/**
 * Preserves the literal installation name in the generated registry, even when
 * the component exports no functions. Select the installed component from
 * `confect/_generated/components` rather than adding the marker by hand.
 *
 * @internal
 */
export type Mounted<Api_, Name extends string> = Api_ & {
  readonly [MountNameId]: Name;
};

/**
 * Convex's generated ComponentApi erases database ID brands at the boundary.
 */
type Wire<A, ValidatorShape extends boolean = false> =
  A extends ConvexId<string>
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
      : A extends ReadonlyArray<infer Item>
        ? ValidatorShape extends true
          ? Array<Wire<Item, true>>
          : { [K in keyof A]: Wire<A[K]> }
        : {
            [K in keyof A as K extends ConvexId<string> ? string : K]: Wire<
              A[K],
              ValidatorShape
            >;
          };

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
    Extract<
      Wire<FunctionSpec.EncodedArgs<FunctionSpec_>, true>,
      DefaultFunctionArgs
    >,
    Wire<FunctionSpec.EncodedReturns<FunctionSpec_>, true>,
    Name
  >;
};

/**
 * The native Convex reference tree expected by a Confect contract. It includes
 * only public exports, with their encoded call types and backend-only
 * visibility. Database IDs cross the native component boundary as strings.
 *
 * @category Utility types
 *
 * @see {@link Bound} for the references returned after attaching codecs.
 */
export type Api<
  Spec_ extends Spec.AnyWithProps,
  Name extends string | undefined = string | undefined,
> = ApiGroups<Spec.Groups<Spec_>, Name>;

type AcceptedArgs<Sent, Native> = unknown extends Native
  ? Sent
  : Native extends unknown
    ? Sent extends Native
      ? Native extends ArrayBuffer
        ? Sent
        : Native extends ReadonlyArray<infer Element>
          ? Sent extends ReadonlyArray<infer Item>
            ? ReadonlyArray<AcceptedArgs<Item, Element>>
            : never
          : Native extends object
            ? Sent extends object
              ? [keyof Sent] extends [keyof Native]
                ? {
                    [K in keyof Sent]: K extends keyof Native
                      ? AcceptedArgs<Sent[K], Native[K]>
                      : never;
                  }
                : never
              : never
            : Sent
      : never
    : never;

type CompatibleApi<Expected, Native> =
  Expected extends FunctionReference<
    infer Kind,
    infer Visibility,
    infer Args,
    infer Returns
  >
    ? Native extends FunctionReference<
        Kind,
        Visibility,
        infer NativeArgs,
        Returns
      >
      ? [Args] extends [AcceptedArgs<Args, NativeArgs>]
        ? Native
        : never
      : never
    : {
        [K in keyof Expected]: K extends keyof Native
          ? CompatibleApi<Expected[K], Native[K]>
          : never;
      };

interface Tree {
  readonly [key: string]: Tree | Ref.Any;
}

/**
 * A component's function contract before installation. A package can publish
 * one contract for multiple hosts or multiple installations in the same host.
 * Each caller supplies its own installed reference to {@link bind}.
 *
 * @category Models
 */
export interface Component<
  Spec_ extends Spec.AnyWithProps,
  Scope extends IdScope.IdScope,
  Tables extends string = string,
> {
  /**
   * @internal
   */
  readonly [TypeId]: {
    readonly refs: Tree;
    readonly scope: Scope;
    readonly tables: ReadonlyArray<Tables>;
  };
  /**
   * The function spec carried at the type level; not a runtime property.
   *
   * @category Models
   */
  readonly "~Spec": Spec_;
}

/**
 * The database scope of a component installed under a particular parent and
 * mount name. Its string representation is not part of the API.
 *
 * @category Models
 */
export type MountScope<
  Parent extends IdScope.IdScope,
  Name extends string | undefined,
> = IdScope.Mount<Parent, Name>;

type MountName<ComponentApi> = ComponentApi extends {
  readonly [MountNameId]: infer Name extends string;
}
  ? Name
  : ComponentApi extends FunctionReference<any, any, any, any, infer Name>
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

/**
 * A component's exported functions as backend-only refs for one installation.
 * Confect functions use decoded arguments, results, and failures with IDs
 * scoped to that installation. Plain Convex functions retain their wire types.
 *
 * @category References
 *
 * @see {@link bind}
 */
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

/**
 * Creates a publishable contract from the public functions in a spec without
 * evaluating their schema factories. The table names determine which IDs the
 * caller can refer to with {@link id}.
 *
 * **When to use**
 *
 * Use to wrap an existing Convex component: describe its native module and
 * function names, using codecs whose encoded arguments and results match the
 * native functions. A Confect-authored component already has a generated
 * contract in `confect/_generated/component`.
 *
 * **Example** (Publishing a wrapper for a native counter mutation)
 *
 * ```ts
 * import {
 *   Component,
 *   FunctionSpec,
 *   GenericId,
 *   GroupSpec,
 *   IdScope,
 *   Spec,
 * } from "@confect/core";
 * import * as Schema from "effect/Schema";
 *
 * const scope = IdScope.component("@example/counter");
 * const counter = GroupSpec.make().addFunction(
 *   FunctionSpec.publicMutation({
 *     name: "create",
 *     args: () => ({ count: Schema.FiniteFromString }),
 *     returns: () => GenericId.GenericId("counters", scope),
 *   }),
 * );
 *
 * export default Component.make(
 *   { [Spec.TypeId]: { counter: GroupSpec.withName("counter", counter) } },
 *   scope,
 *   ["counters"],
 * );
 * ```
 *
 * @category Constructors
 *
 * @throws If the scope is empty, or a group and a function share a name under
 *   the same parent.
 *
 * @see {@link bind} to use the published contract in a caller.
 */
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
            return Match.value(functionSpec.functionVisibility).pipe(
              Match.when("public", () => true),
              Match.when("internal", () => false),
              Match.exhaustive,
            );
          }),
          Record.map((functionSpec) =>
            Ref.make(path, functionSpec, group.middlewareAttachments),
          ),
        );
        return { ...collect(group.groups, path), ...functions };
      }),
      Record.filter((children) => !Record.isEmptyRecord(children)),
    );
  return {
    [TypeId]: { refs: collect(Spec.groups(spec)), scope, tables },
  } as Component<Spec_, Scope, Tables>;
};

/**
 * Binds a component contract to an installed entry from
 * `confect/_generated/components`. Pass the returned function refs to backend
 * runners or the scheduler. Binding preserves native call destinations and does
 * not install a component or evaluate the function schemas.
 *
 * **Details**
 *
 * Confect refs apply the contract's codecs and typed failures. IDs belonging to
 * the component or its descendants acquire types specific to the installation.
 * A child installed inside another component needs `{ parentScope: scope }`,
 * using that parent's generated `scope` from `confect/_generated/id`. Omit the
 * options when binding in the application.
 *
 * **Gotchas**
 *
 * Keep the registry entry's inferred type. Widening away its literal mount name
 * can make IDs from two installations interchangeable in TypeScript.
 *
 * @category Constructors
 *
 * @throws If the native argument has no installed component reference.
 *
 * @see {@link id} for a schema for one of the installation's table IDs.
 * @see {@link schema} for rebinding a component's exported codec.
 */
export const bind = <
  Spec_ extends Spec.AnyWithProps,
  From extends IdScope.IdScope,
  Tables extends string,
  Native extends object,
  const Parent extends IdScope.IdScope = IdScope.App,
>(
  component: Component<Spec_, From, Tables>,
  native: Native & CompatibleApi<Api<NoInfer<Spec_>>, NoInfer<Native>>,
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
  const rebaseMiddleware = memoize(
    (middleware: MiddlewareSpec.AnyMiddlewareSpec) => {
      if (!("error" in middleware)) return middleware;
      const boundMiddleware = Object.create(
        middleware,
      ) as MiddlewareSpec.AnyMiddlewareSpec;
      Lazy.defineProperty(boundMiddleware, "error", () => {
        const error = middleware.error;
        return error === undefined ? undefined : rebase(error);
      });
      return boundMiddleware;
    },
  );
  const visit = (tree: Tree, references: unknown): Tree =>
    Record.map(tree, (child, key) => {
      const reference = (references as Record<string, unknown>)[key];
      if (Ref.isRef(child)) {
        const nativeRef = reference as FunctionReference<any, any>;
        return Match.value(child).pipe(
          Match.tag("Convex", (ref) => ({
            ...ref,
            functionReference: nativeRef,
          })),
          Match.tag("Confect", (ref) => {
            const bound = {
              [Ref.TypeId]: Ref.TypeId as Ref.TypeId,
              _tag: "Confect" as const,
              convexFunctionName: ref.convexFunctionName,
              functionReference: nativeRef,
              kind: Match.value(ref.kind).pipe(
                Match.tag("Standard", (kind) => kind),
                Match.tag("Paginated", (kind) => {
                  const boundKind = { _tag: "Paginated" as const };
                  Lazy.defineProperty(boundKind, "userArgs", () =>
                    Schema.Struct(Record.map(kind.userArgs.fields, rebase)),
                  );
                  Lazy.defineProperty(boundKind, "item", () =>
                    rebase(kind.item),
                  );
                  Lazy.defineProperty(boundKind, "page", () =>
                    rebase(kind.page),
                  );
                  return boundKind as FunctionProvenance.Paginated;
                }),
                Match.exhaustive,
              ),
              middlewareAttachments: Array.map(
                ref.middlewareAttachments,
                (attachment) => ({
                  ...attachment,
                  spec: rebaseMiddleware(attachment.spec),
                }),
              ),
              get middlewareSpecs() {
                return Array.map(
                  this.middlewareAttachments,
                  ({ spec }) => spec,
                );
              },
            };
            Lazy.defineProperty(bound, "args", () =>
              Schema.Struct(Record.map(ref.args.fields, rebase)),
            );
            Lazy.defineProperty(bound, "returns", () => rebase(ref.returns));
            if ("error" in ref) {
              Lazy.defineProperty(bound, "error", () => {
                const error = ref.error;
                return error === undefined ? undefined : rebase(error);
              });
            }
            return bound as unknown as Ref.AnyConfect;
          }),
          Match.exhaustive,
        );
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

/**
 * Creates an ID schema for one of a bound component's tables. Use it in host
 * functions or tables that refer to documents in this installation, rather than
 * the host's generated `Id` for a same-named local table.
 *
 * **Gotchas**
 *
 * The value on the wire is still a string. Decoding a foreign ID does not prove
 * that the document exists or belongs to the installation.
 *
 * @category Schemas
 *
 * @see {@link schema} to reuse a codec containing several scoped fields.
 */
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

/**
 * Rebinds a component's exported codec for use in a host function or table. IDs
 * belonging to the component and its descendants acquire the bound
 * installation's scope on both the decoded and encoded sides. IDs from
 * unrelated scopes, wire values, and codec transformations are preserved.
 *
 * @category Schemas
 *
 * @see {@link id} when only a table ID schema is needed.
 */
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
