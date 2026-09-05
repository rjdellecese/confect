import * as Brand from "effect/Brand";

/** A database namespace identity, not a runtime ownership check. */
export type IdScope<Identity extends string = string> = Identity &
  Brand.Brand<"@confect/core/IdScope">;

const brand = Brand.nominal<IdScope>();

// The nominal constructor preserves the input string, including its literal type.
const make = <const Identity extends string>(
  identity: Identity,
): IdScope<Identity> => brand(identity) as IdScope<Identity>;

/** The application scope. Component scopes are generated alongside their IDs. */
export type App = IdScope<"">;
export const app: App = make("");

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

export type Instance<
  Parent extends IdScope,
  Name extends string,
> = IdScope<`${ScopeIdentity<Parent>}/instance:${Name}`> &
  InstanceIdentity<Parent, Name>;

/** An installed namespace's opaque identity, independent of address syntax. */
export type Mount<
  Parent extends IdScope,
  Name extends string | undefined,
> = IdScope & {
  readonly "~@confect/core/ComponentMount": {
    readonly parent: Parent;
    readonly name: Name;
  };
};

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

export const component = <const Name extends string>(
  name: Name,
): Component<Name> => make(`component:${name}`);

export const instance = <
  const Parent extends IdScope,
  const Name extends string,
>(
  parent: Parent,
  name: Name,
): Instance<Parent, Name> =>
  make(`${parent}/instance:${name}`) as Instance<Parent, Name>;
