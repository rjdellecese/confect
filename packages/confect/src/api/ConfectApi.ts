import { Predicate, Record } from "effect";
import * as ConfectApiGroup from "./ConfectApiGroup";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApi");

export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApi.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApi<
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
  ): ConfectApi<Name, Groups | Group>;
}

export declare namespace ConfectApi {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps
    extends ConfectApi<string, ConfectApiGroup.ConfectApiGroup.AnyWithProps> {}
}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps>(
    this: ConfectApi.AnyWithProps,
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
}): ConfectApi<Name, Groups> =>
  Object.assign(Object.create(Proto), {
    name,
    groups,
  });

export const make = <const Name extends string>(name: Name): ConfectApi<Name> =>
  makeProto({ name, groups: Record.empty() });
