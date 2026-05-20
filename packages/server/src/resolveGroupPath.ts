import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as Spec from "@confect/core/Spec";
import { Array, Record } from "effect";

export const resolveGroupPath = (
  spec: Spec.AnyWithProps,
  target: GroupSpec.AnyWithProps,
): string | undefined => {
  for (const [name, group] of Record.toEntries(spec.groups)) {
    if (group === target) {
      return name;
    }

    const nested = resolveGroupPathInGroup(group, target, [name]);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
};

const resolveGroupPathInGroup = (
  group: GroupSpec.AnyWithProps,
  target: GroupSpec.AnyWithProps,
  pathSegments: ReadonlyArray<string>,
): string | undefined => {
  for (const [name, child] of Record.toEntries(group.groups)) {
    if (child === target) {
      return Array.join([...pathSegments, name], ".");
    }

    const nested = resolveGroupPathInGroup(child, target, [...pathSegments, name]);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
};

export const resolveGroupPathOrDie = (
  spec: Spec.AnyWithProps,
  target: GroupSpec.AnyWithProps,
): string => {
  const groupPath = resolveGroupPath(spec, target);
  if (groupPath === undefined) {
    throw new Error(
      "Could not resolve group path for the provided GroupSpec. Ensure the spec is part of the assembled API spec tree.",
    );
  }
  return groupPath;
};
