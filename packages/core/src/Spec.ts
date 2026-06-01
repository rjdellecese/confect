import { Array, Option, Predicate, Record, String } from "effect";
import * as GroupSpec from "./GroupSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";
import { validateConfectFunctionIdentifier } from "./Identifier";

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
  /**
   * Mapping from an imported leaf `GroupSpec` reference to its full dot-path
   * within this spec tree. Populated by codegen-emitted `_generated/spec.ts`
   * via {@link Spec#addPath}; consumed by `FunctionImpl.make` /
   * `GroupImpl.make` to resolve a spec's location without walking the tree.
   */
  readonly paths: ReadonlyMap<GroupSpec.AnyWithProps, string>;

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

  /**
   * Register the imported leaf `group` at `path` within this spec's path
   * mapping. Returns a new `Spec` with one additional entry. The tree shape
   * (`groups`) is unaffected — registration and tree assembly are
   * independent steps, both performed by codegen in `_generated/spec.ts`.
   *
   * Re-registering the same group with the same path is a no-op (cheap
   * defense for codegen watch-mode re-imports). Re-registering with a
   * different path throws.
   */
  addPath(group: GroupSpec.AnyWithProps, path: string): Spec<Runtime, Groups_>;
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

const validatePath = (path: string): void => {
  if (path.length === 0) {
    throw new Error(
      "Expected a non-empty Confect group path, but received an empty string.",
    );
  }

  const segments = String.split(path, ".");

  for (const segment of segments) {
    if (segment.length === 0) {
      throw new Error(
        `Expected a Confect group path made of dot-separated identifier segments, but received: "${path}".`,
      );
    }
    validateConfectFunctionIdentifier(segment);
  }
};

const Proto = {
  [TypeId]: TypeId,

  add<Group extends GroupSpec.AnyWithProps>(this: AnyWithProps, group: Group) {
    return makeProto({
      runtime: this.runtime,
      groups: Record.set(this.groups, group.name, group),
      paths: this.paths,
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
      paths: this.paths,
    });
  },

  addPath(this: AnyWithProps, group: GroupSpec.AnyWithProps, path: string) {
    validatePath(path);

    const existing = this.paths.get(group);
    if (existing !== undefined) {
      if (existing === path) {
        return this;
      }
      throw new Error(
        `Spec.addPath: the provided GroupSpec is already registered at "${existing}", but was re-registered at "${path}". Each GroupSpec must have at most one path.`,
      );
    }

    const nextPaths = new Map(this.paths);
    nextPaths.set(group, path);

    return makeProto({
      runtime: this.runtime,
      groups: this.groups,
      paths: nextPaths,
    });
  },
};

const makeProto = <
  Runtime extends RuntimeAndFunctionType.Runtime,
  Groups_ extends GroupSpec.AnyWithPropsWithRuntime<Runtime>,
>({
  runtime,
  groups,
  paths,
}: {
  runtime: Runtime;
  groups: Record.ReadonlyRecord<string, Groups_>;
  paths: ReadonlyMap<GroupSpec.AnyWithProps, string>;
}): Spec<Runtime, Groups_> =>
  Object.assign(Object.create(Proto), {
    runtime,
    groups,
    paths,
  });

const emptyPaths = (): ReadonlyMap<GroupSpec.AnyWithProps, string> => new Map();

export const make = (): Spec<"Convex"> =>
  makeProto({ runtime: "Convex", groups: {}, paths: emptyPaths() });

export const makeNode = (): Spec<"Node"> =>
  makeProto({ runtime: "Node", groups: {}, paths: emptyPaths() });

/**
 * Merges a Convex spec with an optional Node spec for use with `Api.make`.
 * When `nodeSpec` is provided, its groups are merged under a "node" namespace,
 * mirroring the structure used by `Refs.make`. The node spec's `paths`
 * entries are re-prefixed with `"node."` so they continue to identify the
 * same leaves at their new positions in the merged tree.
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

  const paths = new Map(convexSpec.paths);
  if (nodeSpec !== undefined) {
    for (const [group, path] of nodeSpec.paths) {
      paths.set(group, `node.${path}`);
    }
  }

  return Object.assign(Object.create(Proto), {
    runtime: "Convex" as const,
    groups,
    paths,
  }) as AnyWithProps;
};
