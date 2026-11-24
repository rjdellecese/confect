/**
 * Database identities for hand-authored component contracts. Prefer a
 * component's generated `scope` from `confect/_generated/id` when available.
 * Scopes distinguish ID types; they do not verify ownership at runtime.
 */

import * as Brand from "effect/Brand";

/**
 * A branded string identifying a database namespace. The brand prevents an
 * arbitrary string from being used as a scope.
 *
 * @category Models
 */
export type IdScope<Identity extends string = string> = Identity &
  Brand.Brand<"@confect/core/IdScope">;

const brand = Brand.nominal<IdScope>();

// The nominal constructor preserves the input string, including its literal type.
const make = <const Identity extends string>(
  identity: Identity,
): IdScope<Identity> => brand(identity) as IdScope<Identity>;

/**
 * The scope type of the root application, where IDs have the native Convex
 * table ID type.
 *
 * @category Models
 */
export type App = IdScope<"">;
/**
 * The root application's database scope. Scope-aware ID constructors use it
 * when no scope is supplied.
 *
 * @category Constants
 */
export const app: App = make("");

/**
 * Keeps the runtime scope argument required for a specific non-application
 * scope. Pass the generated component scope instead of building an argument
 * tuple.
 *
 * @internal
 */
export type Args<Scope extends IdScope> =
  | [scope: Scope]
  | (App extends Scope ? [scope?: Scope | undefined] : never);

/**
 * A component definition's database scope before it is bound to a particular
 * installation.
 *
 * @category Models
 *
 * @see {@link component}
 */
export type Component<Name extends string> = IdScope<`component:${Name}`>;

interface InstanceIdentity<Parent extends IdScope, Name extends string> {
  readonly "~@confect/core/IdScopeInstance": {
    readonly parent: Parent;
    readonly name: Name;
  };
}

// Strip instance metadata as well as the brand before interpolating literals.
type ScopeIdentity<Scope extends IdScope> =
  Scope extends InstanceIdentity<infer Parent, infer Name>
    ? `${ScopeIdentity<Parent>}/instance:${Name}`
    : Brand.Brand.Unbranded<Scope> & string;

/**
 * The scope of a named instance under a parent database scope. The parent
 * remains part of the type, so the same child name can occur in different
 * parents.
 *
 * @category Models
 *
 * @see {@link instance}
 */
export type Instance<
  Parent extends IdScope,
  Name extends string,
> = IdScope<`${ScopeIdentity<Parent>}/instance:${Name}`> &
  InstanceIdentity<Parent, Name>;

/**
 * The opaque scope of an installed component from the native registry. Its
 * identity depends on the parent and mount name, not a public address syntax.
 *
 * @category Models
 */
export type Mount<
  Parent extends IdScope,
  Name extends string | undefined,
> = IdScope & {
  readonly "~@confect/core/ComponentMount": {
    readonly parent: Parent;
    readonly name: Name;
  };
};

/**
 * Replaces a definition scope with an installation scope, including within the
 * parent scopes of descendants. Unrelated scopes keep their identities.
 *
 * @category Utility types
 */
export type Rebase<
  Scope extends IdScope,
  From extends IdScope,
  To extends IdScope,
> = Scope extends From
  ? To
  : Scope extends Mount<infer Parent, infer Name>
    ? Mount<Rebase<Parent, From, To>, Name>
    : Scope extends InstanceIdentity<infer Parent, infer Name>
      ? Instance<Rebase<Parent, From, To>, Name>
      : Scope;

/**
 * Creates the definition scope for a hand-authored component contract. Use the
 * same scope for the contract and the IDs it declares, so binding the contract
 * can rebind those IDs for each installation.
 *
 * @category Constructors
 *
 * @see {@link instance} for a named child scope.
 */
export const component = <const Name extends string>(
  name: Name,
): Component<Name> => make(`component:${name}`);

/**
 * Creates a named child scope relative to a parent scope for hand-authored
 * schemas. For IDs from an installed registry component, use `Component.id`
 * with the binding instead of trying to reconstruct its opaque scope.
 *
 * **Example** (Distinguishing parent and child IDs in a contract)
 *
 * ```ts
 * import { GenericId, IdScope } from "@confect/core";
 * import * as Schema from "effect/Schema";
 *
 * const parent = IdScope.component("@example/archive");
 * const child = IdScope.instance(parent, "replica");
 *
 * const Copy = Schema.Struct({
 *   source: GenericId.GenericId("items", parent),
 *   replica: GenericId.GenericId("items", child),
 * });
 * ```
 *
 * @category Constructors
 *
 * @see {@link component} for a component's definition scope.
 */
export const instance = <
  const Parent extends IdScope,
  const Name extends string,
>(
  parent: Parent,
  name: Name,
): Instance<Parent, Name> =>
  make(`${parent}/instance:${name}`) as Instance<Parent, Name>;
