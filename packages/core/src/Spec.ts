import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as GroupSpec from "./GroupSpec";

export const TypeId = "@confect/core/Spec";
export type TypeId = typeof TypeId;

export const isSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

/**
 * A Confect spec: a flat container of function groups. Groups may be of any
 * runtime — a group built with `GroupSpec.makeNode()` (a Node action group) sits
 * alongside `GroupSpec.make()` groups in the same namespace. The runtime of a
 * group lives on the group itself (`GroupSpec.runtime`) and on each function's
 * `RuntimeAndFunctionType`; the spec does not carry a runtime of its own.
 */
export interface Spec<Groups_ extends GroupSpec.AnyWithProps = never> {
  readonly [TypeId]: TypeId;
  readonly groups: {
    [GroupName in GroupSpec.Name<Groups_>]: GroupSpec.WithName<
      Groups_,
      GroupName
    >;
  };

  add<Group extends GroupSpec.AnyWithProps>(
    group: Group,
  ): Spec<Groups_ | Group>;

  addAt<const Name extends string, Group extends GroupSpec.AnyWithProps>(
    name: Name,
    group: Group,
  ): Spec<Groups_ | GroupSpec.NamedAt<Group, Name>>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Spec<GroupSpec.AnyWithProps> {}

export type Groups<Spec_ extends AnyWithProps> =
  Spec_["groups"][keyof Spec_["groups"]];

const Proto = {
  [TypeId]: TypeId,

  add<Group extends GroupSpec.AnyWithProps>(this: AnyWithProps, group: Group) {
    return makeProto({
      groups: Record.set(this.groups, group.name, group),
    });
  },

  addAt<Group extends GroupSpec.AnyWithProps>(
    this: AnyWithProps,
    name: string,
    group: Group,
  ) {
    return makeProto({
      groups: Record.set(this.groups, name, GroupSpec.withName(name, group)),
    });
  },
};

const makeProto = <Groups_ extends GroupSpec.AnyWithProps>({
  groups,
}: {
  groups: Record.ReadonlyRecord<string, Groups_>;
}): Spec<Groups_> =>
  Object.assign(Object.create(Proto), {
    groups,
  });

export const make = (): Spec => makeProto({ groups: {} });
