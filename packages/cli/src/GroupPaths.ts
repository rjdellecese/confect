import * as Schema from "effect/Schema";
import * as GroupPath from "./GroupPath";

export const GroupPaths = Schema.HashSet(GroupPath.GroupPath).pipe(
  Schema.brand("@confect/cli/GroupPaths"),
);
export type GroupPaths = typeof GroupPaths.Type;
