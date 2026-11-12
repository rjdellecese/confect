import * as Predicate from "effect/Predicate";
import * as Data from "effect/Data";
import * as Array from "effect/Array";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as GroupSpec from "./GroupSpec";

export const TypeId = "~@confect/core/Spec";
export type TypeId = typeof TypeId;

export const isSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

/**
 * A Confect spec: a flat container of function groups. Groups may be of any
 * runtime—a group built with `GroupSpec.makeNode()` (a Node action group) sits
 * alongside `GroupSpec.make()` groups in the same namespace. The runtime of a
 * group lives on the group itself (`GroupSpec.runtime`) and on each function's
 * `RuntimeAndFunctionType`; the spec does not carry a runtime of its own.
 */
export interface Spec<
  Groups_ extends Record.ReadonlyRecord<string, GroupSpec.AnyWithProps> = {},
> {
  readonly [TypeId]: Readonly<Groups_>;
}

export interface Any {
  readonly [TypeId]: unknown;
}

export interface AnyWithProps extends Any {
  readonly [TypeId]: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>;
}

export type Groups<Spec_ extends AnyWithProps> =
  Spec_[TypeId][keyof Spec_[TypeId]];

/**
 * The group record stored by a spec, with its precise member types.
 */
export const groups = <Spec_ extends AnyWithProps>(
  self: Spec_,
): Spec_[TypeId] => self[TypeId];

export const fromGroups = (
  record: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
): AnyWithProps => {
  const validation = validateGroups(record);
  if (Result.isFailure(validation)) {
    throw InvalidRootGroups.make({ issue: validation.failure });
  }
  return {
    [TypeId]: Record.map(record, (group, name) =>
      GroupSpec.withName(name, group),
    ),
  };
};

export interface RootGroupEntry {
  readonly path: ReadonlyArray<string>;
  readonly root?: boolean;
  readonly functionNames: ReadonlyArray<string>;
}

const RootGroupsIssue = Schema.TaggedUnion({
  NestedRoot: { path: Schema.Array(Schema.String) },
  MultipleRoots: { paths: Schema.String.pipe(Schema.Array, Schema.Array) },
  RootNameCollision: {
    name: Schema.String,
    paths: Schema.String.pipe(Schema.Array, Schema.Array),
  },
});

export type RootGroupsError = typeof RootGroupsIssue.Type;

export const RootGroupsError = Data.taggedEnum<RootGroupsError>();

export const formatRootGroupsError = RootGroupsError.$match({
  NestedRoot: ({ path }) =>
    `Root group "${Array.join(path, "/")}" must be at the top level`,
  MultipleRoots: ({ paths }) =>
    `Only one root group is allowed: ${Array.join(
      Array.map(paths, (path) => `"${Array.join(path, "/")}"`),
      ", ",
    )}`,
  RootNameCollision: ({ name, paths }) =>
    `Root ref name "${name}" collides between groups ${Array.join(
      Array.map(paths, (path) => `"${Array.join(path, "/")}"`),
      " and ",
    )}`,
});

export class InvalidRootGroups extends Schema.TaggedError<
  InvalidRootGroups,
  { readonly brand: unique symbol }
>()("InvalidRootGroups", { issue: RootGroupsIssue }) {
  override get message(): string {
    return formatRootGroupsError(this.issue);
  }
}

export const validateRootGroups = (
  entries: ReadonlyArray<RootGroupEntry>,
): Result.Result<void, RootGroupsError> => {
  const roots = Array.filter(entries, (entry) => entry.root === true);
  for (const root of roots) {
    if (root.path.length !== 1) {
      return Result.fail(RootGroupsError.NestedRoot({ path: root.path }));
    }
  }
  if (roots.length > 1) {
    return Result.fail(
      RootGroupsError.MultipleRoots({
        paths: Array.map(roots, ({ path }) => path),
      }),
    );
  }
  const root = roots[0];
  if (root === undefined) return Result.void;

  const namespaces = new Map<string, ReadonlyArray<string>>();
  for (const entry of entries) {
    const top = entry.path[0];
    if (top !== undefined && top !== root.path[0]) {
      namespaces.set(top, [top]);
    }
  }
  for (const name of root.functionNames) {
    const previous = namespaces.get(name);
    if (previous !== undefined) {
      return Result.fail(
        RootGroupsError.RootNameCollision({
          name,
          paths: [root.path, previous],
        }),
      );
    }
    namespaces.set(name, root.path);
  }
  const children = new Set<string>();
  for (const entry of entries) {
    const name = entry.path[1];
    if (
      entry.path[0] !== root.path[0] ||
      name === undefined ||
      children.has(name)
    ) {
      continue;
    }
    children.add(name);
    const path = entry.path.slice(0, 2);
    const previous = namespaces.get(name);
    if (previous !== undefined) {
      return Result.fail(
        RootGroupsError.RootNameCollision({ name, paths: [path, previous] }),
      );
    }
    namespaces.set(name, path);
  }
  return Result.void;
};

export const validateGroups = (
  record: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
): Result.Result<void, RootGroupsError> => {
  const entries: Array<RootGroupEntry> = [];
  const visit = (
    groups_: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
    parent: ReadonlyArray<string>,
  ): void => {
    for (const [name, group] of Record.toEntries(groups_)) {
      const path = [...parent, name];
      entries.push({
        path,
        root: group.root,
        functionNames: Record.keys(group.functions),
      });
      visit(group.groups, path);
    }
  };
  visit(record, []);
  return validateRootGroups(entries);
};
