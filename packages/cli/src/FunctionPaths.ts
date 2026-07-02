import type { GroupSpec, Spec } from "@confect/core";
import { pipe } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as FunctionPath from "./FunctionPath";
import * as GroupPath from "./GroupPath";
import * as GroupPaths from "./GroupPaths";

export const FunctionPaths = Schema.HashSet(
  FunctionPath.FunctionPath,
).pipe(Schema.brand("@confect/cli/FunctionPaths"));
export type FunctionPaths = typeof FunctionPaths.Type;

export const make = (spec: Spec.AnyWithProps): FunctionPaths =>
  makeHelper(spec.groups, Option.none(), FunctionPaths.make(HashSet.empty()));

const makeHelper = (
  groups: {
    [key: string]: GroupSpec.AnyWithProps;
  },
  currentGroupPath: Option.Option<GroupPath.GroupPath>,
  apiPaths: FunctionPaths,
): FunctionPaths =>
  Record.reduce(groups, apiPaths, (acc, group, groupName) => {
    const groupPath = Option.match(currentGroupPath, {
      onNone: () => GroupPath.make([groupName]),
      onSome: (path) => GroupPath.append(path, groupName),
    });

    const accWithFunctions = Record.reduce(
      group.functions,
      acc,
      (acc_, _fn, functionName) =>
        FunctionPaths.make(
          HashSet.add(
            acc_,
            FunctionPath.FunctionPath.make({
              groupPath,
              name: functionName,
            }),
          ),
        ),
    );

    return makeHelper(group.groups, Option.some(groupPath), accWithFunctions);
  });

export const groupPaths = (
  functionPaths: FunctionPaths,
): GroupPaths.GroupPaths =>
  pipe(
    functionPaths,
    HashSet.map(FunctionPath.groupPath),
    GroupPaths.GroupPaths.make,
  );

export const diff = (
  previousFunctions: FunctionPaths,
  currentFunctions: FunctionPaths,
): {
  functionsAdded: FunctionPaths;
  functionsRemoved: FunctionPaths;
  groupsRemoved: GroupPaths.GroupPaths;
  groupsAdded: GroupPaths.GroupPaths;
  groupsChanged: GroupPaths.GroupPaths;
} => {
  const currentGroups = groupPaths(currentFunctions);
  const previousGroups = groupPaths(previousFunctions);

  const groupsAdded = GroupPaths.GroupPaths.make(
    HashSet.difference(currentGroups, previousGroups),
  );
  const groupsRemoved = GroupPaths.GroupPaths.make(
    HashSet.difference(previousGroups, currentGroups),
  );

  const functionsAdded = FunctionPaths.make(
    HashSet.difference(currentFunctions, previousFunctions),
  );
  const existingGroupsToWhichFunctionsWereAdded = GroupPaths.GroupPaths.make(
    HashSet.intersection(currentGroups, groupPaths(functionsAdded)),
  );

  const functionsRemoved = FunctionPaths.make(
    HashSet.difference(previousFunctions, currentFunctions),
  );
  const existingGroupsToWhichFunctionsWereRemoved = GroupPaths.GroupPaths.make(
    HashSet.intersection(previousGroups, groupPaths(functionsRemoved)),
  );

  const groupsChanged = pipe(
    existingGroupsToWhichFunctionsWereAdded,
    HashSet.union(existingGroupsToWhichFunctionsWereRemoved),
    HashSet.difference(HashSet.union(groupsAdded, groupsRemoved)),
    GroupPaths.GroupPaths.make,
  );

  return {
    functionsAdded,
    functionsRemoved,
    groupsRemoved,
    groupsAdded,
    groupsChanged,
  };
};
