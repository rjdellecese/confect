import { Predicate, Record } from "effect";
import type * as ConfectApiGroup from "./ConfectApiGroup";

export const TypeId = "@rjdellecese/confect/ConfectApiSpec";
export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApiSpec.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiSpec<
  Groups extends ConfectApiGroup.ConfectApiGroup.Any = never,
> {
  readonly [TypeId]: TypeId;
  readonly groups: {
    [GroupName in Groups["name"]]: Extract<Groups, { name: GroupName }>;
  };

  add<Group extends ConfectApiGroup.ConfectApiGroup.Any>(
    group: Group,
  ): ConfectApiSpec<Groups | Group>;
}

export declare namespace ConfectApiSpec {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps {
    readonly [TypeId]: TypeId;
    readonly groups: {
      [x: string]: any;
    };
    add<Group extends ConfectApiGroup.ConfectApiGroup.Any>(
      group: Group,
    ): AnyWithProps;
  }

  export type Groups<Spec extends AnyWithProps> =
    Spec extends ConfectApiSpec<infer Groups_> ? Groups_ : never;
}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps>(
    this: ConfectApiSpec.AnyWithProps,
    group: Group,
  ) {
    return makeProto({
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
>({
  groups,
}: {
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApiSpec<Groups> =>
  Object.assign(Object.create(Proto), {
    groups,
  });

export const make = (): ConfectApiSpec => makeProto({ groups: Record.empty() });
