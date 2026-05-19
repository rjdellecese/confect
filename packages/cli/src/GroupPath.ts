import { type GroupSpec, type Spec } from "@confect/core";
import { Array, Effect, Option, pipe, Record, Schema, String } from "effect";

import * as Path from "./internal/path";

/**
 * The path to a group in the Confect API.
 */
export class GroupPath extends Schema.Class<GroupPath>("GroupPath")({
  pathSegments: Schema.NonEmptyArray(Schema.NonEmptyString),
}) {}

/**
 * Create a GroupPath from path segments.
 */
export const make = (pathSegments: readonly [string, ...string[]]): GroupPath =>
  GroupPath.make({ pathSegments });

/**
 * Append a group name to a GroupPath to create a new GroupPath.
 */
export const append = (groupPath: GroupPath, groupName: string): GroupPath =>
  make([...groupPath.pathSegments, groupName]);

/**
 * Expects a path string of the form `./group1/group2.ts`, relative to the Convex functions directory.
 */
export const fromGroupModulePath = (
  groupModulePath: string,
): Effect.Effect<GroupPath, GroupModulePathIsNotATypeScriptFileError> =>
  Effect.gen(function* () {
    const { dir, name, ext } = Path.parse(groupModulePath);

    if (ext === ".ts") {
      const dirSegments = Array.filter(
        String.split(dir, Path.sep),
        String.isNonEmpty,
      );
      const segments: ReadonlyArray<string> = [...dirSegments, name];
      yield* Effect.logDebug(segments);
      if (segments.length === 0) {
        return yield* new GroupModulePathIsNotATypeScriptFileError({
          path: groupModulePath,
        });
      }
      return make(segments as readonly [string, ...string[]]);
    } else {
      return yield* new GroupModulePathIsNotATypeScriptFileError({
        path: groupModulePath,
      });
    }
  });

/**
 * Get the module path for a group, relative to the Convex functions directory.
 */
export const modulePath = (groupPath: GroupPath): string =>
  Path.join(...groupPath.pathSegments) + ".ts";

export const getGroupSpec = (
  spec: Spec.AnyWithProps,
  groupPath: GroupPath,
): Option.Option<GroupSpec.AnyWithProps> => {
  const segments = groupPath.pathSegments;
  if (segments.length === 0) return Option.none();
  const [head, ...tail] = segments;
  if (head === undefined) return Option.none();
  return pipe(
    Record.get(spec.groups, head),
    Option.flatMap((group) =>
      tail.length > 0 ? getGroupSpecHelper(group, tail) : Option.some(group),
    ),
  );
};

const getGroupSpecHelper = (
  group: GroupSpec.AnyWithProps,
  remainingPath: ReadonlyArray<string>,
): Option.Option<GroupSpec.AnyWithProps> => {
  if (remainingPath.length === 0) return Option.some(group);
  const [head, ...tail] = remainingPath;
  if (head === undefined) return Option.some(group);
  return pipe(
    Record.get(group.groups, head),
    Option.flatMap((subGroup) =>
      tail.length > 0
        ? getGroupSpecHelper(subGroup, tail)
        : Option.some(subGroup),
    ),
  );
};

export const toString = (groupPath: GroupPath): string =>
  Array.join(groupPath.pathSegments, ".");

export class GroupModulePathIsNotATypeScriptFileError extends Schema.TaggedErrorClass<GroupModulePathIsNotATypeScriptFileError>()(
  "GroupModulePathIsNotATypeScriptFileError",
  {
    path: Schema.NonEmptyString,
  },
) {
  get message(): string {
    return `Expected group module path to end with .ts, got ${this.path}`;
  }
}
