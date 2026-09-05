/** The application scope. Component scopes are generated alongside their IDs. */
export type App = "";
export const app: App = "";

export type Component<Name extends string> = `component:${Name}`;
export type Instance<
  Parent extends string,
  Name extends string,
> = `${Parent}/instance:${Name}`;

/** An installed namespace's opaque identity, independent of address syntax. */
export type Mount<
  Parent extends string,
  Name extends string | undefined,
> = string & {
  readonly "~@confect/core/ComponentMount": {
    readonly parent: Parent;
    readonly name: Name;
  };
};

export type Rebase<
  Scope extends string,
  From extends string,
  To extends string,
> = Scope extends From
  ? To
  : Scope extends Mount<infer Parent, infer Name>
    ? Mount<Rebase<Parent, From, To>, Name>
    : Scope extends `${From}/instance:${infer Rest}`
      ? Instance<To, Rest>
      : Scope;

export const component = <const Name extends string>(
  name: Name,
): Component<Name> => `component:${name}`;

export const instance = <
  const Parent extends string,
  const Name extends string,
>(
  parent: Parent,
  name: Name,
): Instance<Parent, Name> => `${parent}/instance:${name}`;
