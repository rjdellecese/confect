import type { GroupSpec } from "@confect/core";
import * as Array from "effect/Array";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import { ParentChildNameCollisionError } from "./CodegenError";
import * as FunctionPath from "./FunctionPath";
import * as FunctionPaths from "./FunctionPaths";
import * as GroupPath from "./GroupPath";
import type { LoadedLeafModule } from "./LeafModule";

export const GroupSummary = Schema.Struct({
  path: GroupPath.GroupPath,
  runtime: Schema.Literals(["Convex", "Node"]),
  functionNames: Schema.Array(Schema.NonEmptyString),
});
export interface GroupSummary extends Schema.Schema.Type<typeof GroupSummary> {}

export const LeafSummary = Schema.Struct({
  relativePath: Schema.String,
  root: GroupSummary,
  descendants: Schema.Array(GroupSummary),
});
export interface LeafSummary extends Schema.Schema.Type<typeof LeafSummary> {}

export const GenerationSnapshot = Schema.HashMap(Schema.String, LeafSummary);
export type GenerationSnapshot = typeof GenerationSnapshot.Type;

const summarizeGroup = (
  path: GroupPath.GroupPath,
  group: GroupSpec.AnyWithProps,
): GroupSummary => ({
  path,
  runtime: group.runtime,
  functionNames: Array.sort(Record.keys(group.functions), String.Order),
});

const summarizeDescendants = (
  path: GroupPath.GroupPath,
  group: GroupSpec.AnyWithProps,
): ReadonlyArray<GroupSummary> => {
  const names = Array.sort(Record.keys(group.groups), String.Order);
  return Array.flatMap(names, (name) => {
    const child = group.groups[name]!;
    const childPath = GroupPath.append(path, name);
    return [
      summarizeGroup(childPath, child),
      ...summarizeDescendants(childPath, child),
    ];
  });
};

export const update = (
  snapshot: GenerationSnapshot,
  leaves: ReadonlyArray<LoadedLeafModule>,
): GenerationSnapshot =>
  Array.reduce(leaves, snapshot, (current, leaf) => {
    const path = GroupPath.make(leaf.pathSegments);
    return HashMap.set(current, leaf.relativePath, {
      relativePath: leaf.relativePath,
      root: summarizeGroup(path, leaf.spec),
      descendants: summarizeDescendants(path, leaf.spec),
    });
  });

export const fromLoadedLeaves = (
  leaves: ReadonlyArray<LoadedLeafModule>,
): GenerationSnapshot => update(HashMap.empty(), leaves);

const groups = (snapshot: GenerationSnapshot): ReadonlyArray<GroupSummary> =>
  Array.flatMap(Array.fromIterable(HashMap.values(snapshot)), (leaf) => [
    leaf.root,
    ...leaf.descendants,
  ]);

export const functionPaths = (
  snapshot: GenerationSnapshot,
): FunctionPaths.FunctionPaths =>
  FunctionPaths.FunctionPaths.make(
    HashSet.fromIterable(
      Array.flatMap(groups(snapshot), (group) =>
        Array.map(group.functionNames, (name) =>
          FunctionPath.FunctionPath.make({ groupPath: group.path, name }),
        ),
      ),
    ),
  );

const generatedGroups = (snapshot: GenerationSnapshot) =>
  HashMap.fromIterable(
    Array.filterMap(groups(snapshot), (group) =>
      group.functionNames.length === 0
        ? Result.fail(undefined)
        : Result.succeed([group.path, group] as const),
    ),
  );

const equivalentGroup = Schema.toEquivalence(GroupSummary);

export const diff = (
  before: GenerationSnapshot,
  after: GenerationSnapshot,
): {
  readonly removed: ReadonlyArray<GroupSummary>;
  readonly changed: ReadonlyArray<GroupSummary>;
} => {
  const previous = generatedGroups(before);
  const current = generatedGroups(after);
  return {
    removed: Array.filter(
      HashMap.values(previous),
      (group) => !HashMap.has(current, group.path),
    ),
    changed: Array.filter(HashMap.values(current), (group) => {
      const old = HashMap.get(previous, group.path);
      return Option.isNone(old) || !equivalentGroup(old.value, group);
    }),
  };
};

export const validateNoParentChildNameCollisions = (
  snapshot: GenerationSnapshot,
): Result.Result<void, ParentChildNameCollisionError> => {
  const leavesBySegments = HashMap.fromIterable(
    Array.map(
      Array.fromIterable(HashMap.values(snapshot)),
      (leaf) => [leaf.root.path.pathSegments.join("/"), leaf] as const,
    ),
  );
  for (const child of HashMap.values(snapshot)) {
    const segments = child.root.path.pathSegments;
    for (let depth = 1; depth < segments.length; depth++) {
      const parent = HashMap.get(
        leavesBySegments,
        segments.slice(0, depth).join("/"),
      );
      if (Option.isNone(parent)) continue;
      const collisionName = segments[depth]!;
      const collisionKind = parent.value.root.functionNames.includes(
        collisionName,
      )
        ? "function"
        : parent.value.descendants.some(
              (group) =>
                group.path.pathSegments.length === depth + 1 &&
                group.path.pathSegments[depth] === collisionName,
            )
          ? "group"
          : undefined;
      if (collisionKind !== undefined) {
        return Result.fail(
          new ParentChildNameCollisionError({
            parentSpecPath: parent.value.relativePath.replaceAll("\\", "/"),
            childSpecPath: child.relativePath.replaceAll("\\", "/"),
            collisionName,
            collisionKind,
          }),
        );
      }
    }
  }
  return Result.succeed(undefined);
};
