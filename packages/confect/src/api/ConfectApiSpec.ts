import { Predicate, Record } from "effect";
import type * as ConfectApiGroup from "./ConfectApiGroup";

export const TypeId = "@rjdellecese/confect/ConfectApiSpec";
export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApiSpec.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiSpec<
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps = never,
> {
  readonly [TypeId]: TypeId;
  readonly groups: {
    [GroupName in ConfectApiGroup.ConfectApiGroup.Name<Groups>]: ConfectApiGroup.ConfectApiGroup.WithName<
      Groups,
      GroupName
    >;
  };

  add<Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps>(
    group: Group,
  ): ConfectApiSpec<Groups | Group>;
}

export declare namespace ConfectApiSpec {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps extends Any {
    readonly groups: {
      readonly [key: string]: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
    };
    add<Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps>(
      group: Group,
    ): AnyWithProps;
  }

  export type Groups<Spec extends AnyWithProps> =
    Spec["groups"][keyof Spec["groups"]];
}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps>(
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
