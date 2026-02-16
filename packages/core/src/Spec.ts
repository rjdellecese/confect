import { Array, Predicate, Record } from "effect";
import * as GroupSpec from "./GroupSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

export const TypeId = "@confect/core/Spec";
export type TypeId = typeof TypeId;

export const isSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export const isConvexSpec = (
  u: unknown,
): u is AnyWithPropsWithRuntime<"Convex"> =>
  Predicate.hasProperty(u, TypeId) &&
  Predicate.hasProperty(u, "runtime") &&
  u.runtime === "Convex";

export const isNodeSpec = (u: unknown): u is AnyWithPropsWithRuntime<"Node"> =>
  Predicate.hasProperty(u, TypeId) &&
  Predicate.hasProperty(u, "runtime") &&
  u.runtime === "Node";

export interface Spec<
  Runtime extends RuntimeAndFunctionType.Runtime,
  Groups_ extends GroupSpec.AnyWithPropsWithRuntime<Runtime> = never,
> {
  readonly [TypeId]: TypeId;
  readonly runtime: Runtime;
  readonly groups: {
    [GroupName in GroupSpec.Name<Groups_>]: GroupSpec.WithName<
      Groups_,
      GroupName
    >;
  };

  add<Group extends GroupSpec.AnyWithPropsWithRuntime<Runtime>>(
    group: Group,
  ): Spec<Runtime, Groups_ | Group>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Spec<
  RuntimeAndFunctionType.Runtime,
  GroupSpec.AnyWithProps
> {}

export interface AnyWithPropsWithRuntime<
  Runtime extends RuntimeAndFunctionType.Runtime,
> extends Spec<Runtime, GroupSpec.AnyWithPropsWithRuntime<Runtime>> {}

export type Groups<Spec_ extends AnyWithProps> =
  Spec_["groups"][keyof Spec_["groups"]];

const Proto = {
  [TypeId]: TypeId,

  add<Group extends GroupSpec.AnyWithProps>(this: AnyWithProps, group: Group) {
    return makeProto({
      runtime: this.runtime,
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <
  Runtime extends RuntimeAndFunctionType.Runtime,
  Groups_ extends GroupSpec.AnyWithPropsWithRuntime<Runtime>,
>({
  runtime,
  groups,
}: {
  runtime: Runtime;
  groups: Record.ReadonlyRecord<string, Groups_>;
}): Spec<Runtime, Groups_> =>
  Object.assign(Object.create(Proto), {
    runtime,
    groups,
  });

export const make = (): Spec<"Convex"> =>
  makeProto({ runtime: "Convex", groups: {} });

export const makeNode = (): Spec<"Node"> =>
  makeProto({ runtime: "Node", groups: {} });

/**
 * Merges a Convex spec with an optional Node spec for use with `Api.make`.
 * When `nodeSpec` is provided, its groups are merged under a "node" namespace,
 * mirroring the structure used by `Refs.make`.
 */
export const merge = <
  ConvexSpec extends AnyWithPropsWithRuntime<"Convex">,
  NodeSpec extends AnyWithPropsWithRuntime<"Node">,
>(
  convexSpec: ConvexSpec,
  nodeSpec?: NodeSpec,
): AnyWithProps => {
  const nodeGroup = nodeSpec
    ? Array.reduce(
        Record.values(nodeSpec.groups),
        GroupSpec.makeNode("node"),
        (nodeGroupSpec, group) => nodeGroupSpec.addGroup(group),
      )
    : null;

  const groups = nodeGroup
    ? { ...convexSpec.groups, node: nodeGroup }
    : convexSpec.groups;

  return Object.assign(Object.create(Proto), {
    runtime: "Convex" as const,
    groups,
  }) as AnyWithProps;
};
