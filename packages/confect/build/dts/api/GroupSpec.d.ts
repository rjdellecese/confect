import { FunctionSpec } from "./FunctionSpec.js";
import { Record } from "effect";

//#region src/api/GroupSpec.d.ts
declare namespace GroupSpec_d_exports {
  export { GroupSpec, Path, TypeId, isGroupSpec, make };
}
declare const TypeId = "@rjdellecese/confect/api/GroupSpec";
type TypeId = typeof TypeId;
declare const isGroupSpec: (u: unknown) => u is GroupSpec.Any;
interface GroupSpec<Name$1 extends string, Functions extends FunctionSpec.AnyWithProps = never, Groups$1 extends GroupSpec.AnyWithProps = never> {
  readonly [TypeId]: TypeId;
  readonly name: Name$1;
  readonly functions: { [FunctionName in FunctionSpec.Name<Functions>]: FunctionSpec.WithName<Functions, FunctionName> };
  readonly groups: { [GroupName in GroupSpec.Name<Groups$1>]: GroupSpec.WithName<Groups$1, GroupName> };
  addFunction<Function$1 extends FunctionSpec.AnyWithProps>(function_: Function$1): GroupSpec<Name$1, Functions | Function$1, Groups$1>;
  addGroup<Group extends GroupSpec.AnyWithProps>(group: Group): GroupSpec<Name$1, Functions, Groups$1 | Group>;
}
declare namespace GroupSpec {
  interface Any {
    readonly [TypeId]: TypeId;
  }
  interface AnyWithProps extends Any {
    readonly name: string;
    readonly functions: {
      [key: string]: FunctionSpec.AnyWithProps;
    };
    readonly groups: {
      [key: string]: AnyWithProps;
    };
    addFunction<Function$1 extends FunctionSpec.AnyWithProps>(function_: Function$1): AnyWithProps;
    addGroup<Group extends AnyWithProps>(group: Group): AnyWithProps;
  }
  type Name<Group extends AnyWithProps> = Group["name"];
  type Functions<Group extends AnyWithProps> = Group["functions"][keyof Group["functions"]];
  type Groups<Group extends AnyWithProps> = Group["groups"][keyof Group["groups"]];
  type GroupNames<Group extends AnyWithProps> = [Groups<Group>] extends [never] ? never : Name<Groups<Group>>;
  type WithName<Group extends AnyWithProps, Name_ extends Name<Group>> = Extract<Group, {
    readonly name: Name_;
  }>;
}
declare namespace Path {
  type All<Group extends GroupSpec.AnyWithProps, Depth extends 1[] = []> = Depth["length"] extends 15 ? string : Group extends any ? [GroupSpec.Groups<Group>] extends [never] ? GroupSpec.Name<Group> : GroupSpec.Name<Group> | AllHelper<Group, GroupSpec.Groups<Group>, Depth> : never;
  type AllHelper<Parent extends GroupSpec.AnyWithProps, Groups$1 extends GroupSpec.AnyWithProps, Depth extends 1[] = []> = Groups$1 extends GroupSpec.AnyWithProps ? `${GroupSpec.Name<Parent>}.${All<Groups$1, [...Depth, 1]>}` : never;
  /**
   * Recursively extracts the group at the given dot-separated path.
   * Path must match the format defined in `Path` above, e.g. "group" or "group.subgroup".
   *
   * Example:
   *   type G = WithPath<RootGroup, "group.subgroup">;
   */
  type GroupAt<Group, Path$1 extends string> = Group extends GroupSpec.AnyWithProps ? Path$1 extends `${infer Head}.${infer Tail}` ? Group extends {
    readonly name: Head;
  } ? Group extends {
    readonly groups: Record.ReadonlyRecord<string, infer SubGroup>;
  } ? GroupAt<SubGroup, Tail> : never : never : GroupSpec.WithName<Group, Path$1> : never;
  type SubGroupsAt<Group extends GroupSpec.AnyWithProps, GroupPath extends string> = GroupSpec.Groups<GroupAt<Group, GroupPath>> extends infer SubGroups ? SubGroups extends GroupSpec.AnyWithProps ? `${GroupPath}.${GroupSpec.Name<SubGroups>}` : never : never;
}
declare const make: <const Name$1 extends string>(name: Name$1) => GroupSpec<Name$1>;
//#endregion
export { GroupSpec, GroupSpec_d_exports, Path, TypeId, isGroupSpec, make };
//# sourceMappingURL=GroupSpec.d.ts.map