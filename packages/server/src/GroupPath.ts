import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as Spec from "@confect/core/Spec";
import { Array, Option, pipe, Record } from "effect";

const resolveGroupPathInGroup = (
  group: GroupSpec.AnyWithProps,
  target: GroupSpec.AnyWithProps,
  pathSegments: ReadonlyArray<string>,
): Option.Option<string> =>
  pipe(
    Record.toEntries(group.groups),
    Array.findFirst(([name, child]) =>
      child === target
        ? Option.some(Array.join([...pathSegments, name], "."))
        : resolveGroupPathInGroup(child, target, [...pathSegments, name]),
    ),
  );

const resolveGroupPath = (
  spec: Spec.AnyWithProps,
  target: GroupSpec.AnyWithProps,
): Option.Option<string> =>
  pipe(
    Record.toEntries(spec.groups),
    Array.findFirst(([name, group]) =>
      group === target
        ? Option.some(name)
        : resolveGroupPathInGroup(group, target, [name]),
    ),
  );

export const resolveGroupPathOrDie = (
  spec: Spec.AnyWithProps,
  target: GroupSpec.AnyWithProps,
): string =>
  resolveGroupPath(spec, target).pipe(
    Option.getOrThrowWith(
      () =>
        new Error(
          "Could not resolve group path for the provided GroupSpec. Ensure the spec is part of the assembled API spec tree.",
        ),
    ),
  );
