import { Predicate, Record } from "effect";
import * as ConfectApiGroup from "./ConfectApiGroup";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApi");

export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApiSpec.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiSpec<
  Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any = never,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly groups: {
    [GroupName in Groups["name"]]: Extract<Groups, { name: GroupName }>;
  };

  add<Group extends ConfectApiGroup.ConfectApiGroup.Any>(
    group: Group
  ): ConfectApiSpec<Name, Groups | Group>;
}

export declare namespace ConfectApiSpec {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps
    extends ConfectApiSpec<
      string,
      ConfectApiGroup.ConfectApiGroup.AnyWithProps
    > {}

  export type Groups<Spec extends AnyWithProps> =
    Spec extends ConfectApiSpec<infer _Name, infer Groups> ? Groups : never;
}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps>(
    this: ConfectApiSpec.AnyWithProps,
    group: Group
  ) {
    return makeProto({
      name: this.name,
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <
  const Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
>({
  name,
  groups,
}: {
  name: Name;
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApiSpec<Name, Groups> =>
  Object.assign(Object.create(Proto), {
    name,
    groups,
  });

export const make = <const Name extends string>(
  name: Name
): ConfectApiSpec<Name> => makeProto({ name, groups: Record.empty() });
