import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
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

  addAt<
    const Name extends string,
    Group extends GroupSpec.AnyWithPropsWithRuntime<Runtime>,
  >(
    name: Name,
    group: Group,
  ): Spec<Runtime, Groups_ | GroupSpec.NamedAt<Group, Name>>;
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

  addAt<Group extends GroupSpec.AnyWithProps>(
    this: AnyWithProps,
    name: string,
    group: Group,
  ) {
    return makeProto({
      runtime: this.runtime,
      groups: Record.set(this.groups, name, GroupSpec.withName(name, group)),
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
 * Merges a Convex spec with an optional Node spec into a single assembled
 * spec (used by codegen to build `Refs.make` and to enumerate function paths).
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
  const groups = Option.fromNullable(nodeSpec).pipe(
    Option.map((nodeSpec_) =>
      Array.reduce(
        Record.toEntries(nodeSpec_.groups),
        GroupSpec.makeNodeAt("node"),
        (nodeGroupSpec, [name, group]) => nodeGroupSpec.addGroupAt(name, group),
      ),
    ),
    Option.match({
      onNone: () => convexSpec.groups,
      onSome: (nodeGroup) => ({ ...convexSpec.groups, node: nodeGroup }),
    }),
  );

  return Object.assign(Object.create(Proto), {
    runtime: "Convex" as const,
    groups,
  }) as AnyWithProps;
};
