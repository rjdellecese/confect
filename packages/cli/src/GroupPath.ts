import { type GroupSpec, type Spec } from "@confect/core";
import { Path } from "@effect/platform";
import {
  Array,
  Data,
  Effect,
  Option,
  pipe,
  Record,
  Schema,
  String,
} from "effect";

/**
 * The path to a group in the Confect API.
 */
export class GroupPath extends Schema.Class<GroupPath>("GroupPath")({
  pathSegments: Schema.Data(Schema.NonEmptyArray(Schema.NonEmptyString)),
}) {}

/**
 * Create a GroupPath from path segments.
 */
export const make = (pathSegments: readonly [string, ...string[]]): GroupPath =>
  GroupPath.make({ pathSegments: Data.array(pathSegments) });

/**
 * Append a group name to a GroupPath to create a new GroupPath.
 */
export const append = (groupPath: GroupPath, groupName: string): GroupPath =>
  make([...groupPath.pathSegments, groupName]);

/**
 * Expects a path string of the form `./group1/group2.ts`, relative to the Convex functions directory.
 */
export const fromGroupModulePath = (groupModulePath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const { dir, name, ext } = path.parse(groupModulePath);

    if (ext === ".ts") {
      const dirSegments = Array.filter(
        String.split(dir, path.sep),
        String.isNonEmpty,
      );
      yield* Effect.logDebug(Array.append(dirSegments, name));
      return make(Array.append(dirSegments, name));
    } else {
      return yield* Effect.fail(
        new GroupModulePathIsNotATypeScriptFileError({ path: groupModulePath }),
      );
    }
  });

/**
 * Get the module path for a group, relative to the Convex functions directory.
 */
export const modulePath = (groupPath: GroupPath) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    return path.join(...groupPath.pathSegments) + ".ts";
  });

export const getGroupSpec = (
  spec: Spec.AnyWithProps,
  groupPath: GroupPath,
): Option.Option<GroupSpec.AnyWithProps> =>
  pipe(
    groupPath.pathSegments,
    Array.matchLeft({
      onEmpty: () => Option.none(),
      onNonEmpty: (head, tail) =>
        pipe(
          Record.get(spec.groups, head),
          Option.flatMap((group) =>
            Array.isNonEmptyArray(tail)
              ? getGroupSpecHelper(group, tail)
              : Option.some(group),
          ),
        ),
    }),
  );

const getGroupSpecHelper = (
  group: GroupSpec.AnyWithProps,
  remainingPath: ReadonlyArray<string>,
): Option.Option<GroupSpec.AnyWithProps> =>
  pipe(
    remainingPath,
    Array.matchLeft({
      onEmpty: () => Option.some(group),
      onNonEmpty: (head, tail) =>
        pipe(
          Record.get(group.groups, head),
          Option.flatMap((subGroup) =>
            Array.isNonEmptyArray(tail)
              ? getGroupSpecHelper(subGroup, tail)
              : Option.some(subGroup),
          ),
        ),
    }),
  );

export const toString = (groupPath: GroupPath) =>
  Array.join(groupPath.pathSegments, ".");

export class GroupModulePathIsNotATypeScriptFileError extends Schema.TaggedError<GroupModulePathIsNotATypeScriptFileError>(
  "GroupModulePathIsNotATypeScriptFileError",
)("GroupModulePathIsNotATypeScriptFileError", {
  path: Schema.NonEmptyString,
}) {
  override get message(): string {
    return `Expected group module path to end with .ts, got ${this.path}`;
  }
}
