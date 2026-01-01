import { Predicate, Record } from "effect";
import type * as GroupSpec from "./GroupSpec";

export const TypeId = "@rjdellecese/confect/api/Spec";
export type TypeId = typeof TypeId;

export const isSpec = (u: unknown): u is Spec.Any =>
  Predicate.hasProperty(u, TypeId);

export interface Spec<Groups extends GroupSpec.GroupSpec.AnyWithProps = never> {
  readonly [TypeId]: TypeId;
  readonly groups: {
    [GroupName in GroupSpec.GroupSpec.Name<Groups>]: GroupSpec.GroupSpec.WithName<
      Groups,
      GroupName
    >;
  };

  add<Group extends GroupSpec.GroupSpec.AnyWithProps>(
    group: Group,
  ): Spec<Groups | Group>;
}

export declare namespace Spec {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  // TODO: Can we extend the `Spec` interface and remove these custom fields?
  export interface AnyWithProps extends Any {
    readonly groups: {
      readonly [key: string]: GroupSpec.GroupSpec.AnyWithProps;
    };
    add<Group extends GroupSpec.GroupSpec.AnyWithProps>(
      group: Group,
    ): AnyWithProps;
  }

  export type Groups<Spec_ extends AnyWithProps> =
    Spec_["groups"][keyof Spec_["groups"]];
}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends GroupSpec.GroupSpec.AnyWithProps>(
    this: Spec.AnyWithProps,
    group: Group,
  ) {
    const group_ = group as unknown as GroupSpec.GroupSpec.AnyWithProps;

    return makeProto({
      groups: Record.set(this.groups, group_.name, group_),
    });
  },
};

const makeProto = <Groups extends GroupSpec.GroupSpec.AnyWithProps>({
  groups,
}: {
  groups: Record.ReadonlyRecord<string, Groups>;
}): Spec<Groups> =>
  Object.assign(Object.create(Proto), {
    groups,
  });

export const make = (): Spec => makeProto({ groups: Record.empty() });
