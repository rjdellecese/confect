import { Predicate, Record } from "effect";
import type * as ConfectApiGroupSpec from "./ConfectApiGroupSpec";

export const TypeId = "@rjdellecese/confect/api/ConfectApiSpec";
export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApiSpec.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiSpec<
  Groups extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps = never,
> {
  readonly [TypeId]: TypeId;
  readonly groups: {
    [GroupName in ConfectApiGroupSpec.ConfectApiGroupSpec.Name<Groups>]: ConfectApiGroupSpec.ConfectApiGroupSpec.WithName<
      Groups,
      GroupName
    >;
  };

  add<Group extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps>(
    group: Group,
  ): ConfectApiSpec<Groups | Group>;
}

export declare namespace ConfectApiSpec {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  // TODO: Can we extend the `ConfectApiSpec` interface and remove these custom fields?
  export interface AnyWithProps extends Any {
    readonly groups: {
      readonly [
        key: string
      ]: ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps;
    };
    add<Group extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps>(
      group: Group,
    ): AnyWithProps;
  }

  export type Groups<Spec extends AnyWithProps> =
    Spec["groups"][keyof Spec["groups"]];
}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps>(
    this: ConfectApiSpec.AnyWithProps,
    group: Group,
  ) {
    const group_ =
      group as unknown as ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps;

    return makeProto({
      groups: Record.set(this.groups, group_.name, group_),
    });
  },
};

const makeProto = <
  Groups extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps,
>({
  groups,
}: {
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApiSpec<Groups> =>
  Object.assign(Object.create(Proto), {
    groups,
  });

export const make = (): ConfectApiSpec => makeProto({ groups: Record.empty() });
