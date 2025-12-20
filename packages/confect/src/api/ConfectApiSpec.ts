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
    [GroupName in ConfectApiGroup.ConfectApiGroup.Name<Groups>]: ConfectApiGroup.ConfectApiGroup.WithName<
      Groups,
      GroupName
    >;
  };

  add<Group extends ConfectApiGroup.ConfectApiGroup.Any>(
    group: Group,
  ): ConfectApiSpec<Groups | Group>;
}

export declare namespace ConfectApiSpec {
  export interface Any {
    readonly [TypeId]: TypeId;
    readonly groups: {
      [key: string]: ConfectApiGroup.ConfectApiGroup.Any;
    };
  }

  export type AnyWithProps =
    ConfectApiSpec<ConfectApiGroup.ConfectApiGroup.Any>;

  export type Groups<Spec extends Any> = Spec["groups"][keyof Spec["groups"]];
}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends ConfectApiGroup.ConfectApiGroup.Any>(
    this: ConfectApiSpec.AnyWithProps,
    group: Group,
  ) {
    const group_ =
      group as unknown as ConfectApiGroup.ConfectApiGroup.AnyWithProps;

    return makeProto({
      groups: Record.set(this.groups, group_.name, group_),
    });
  },
};

const makeProto = <Groups extends ConfectApiGroup.ConfectApiGroup.Any>({
  groups,
}: {
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApiSpec<Groups> =>
  Object.assign(Object.create(Proto), {
    groups,
  });

export const make = (): ConfectApiSpec => makeProto({ groups: Record.empty() });
