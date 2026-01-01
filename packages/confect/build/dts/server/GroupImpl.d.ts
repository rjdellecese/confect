import { GroupSpec, Path } from "../api/GroupSpec.js";
import { Api } from "./Api.js";
import { FunctionImpl } from "./FunctionImpl.js";
import { Context, Layer } from "effect";

//#region src/server/GroupImpl.d.ts
declare namespace GroupImpl_d_exports {
  export { GroupImpl, make };
}
interface GroupImpl<GroupPath extends string> {
  readonly groupPath: GroupPath;
}
declare const GroupImpl: <GroupPath extends string>({
  groupPath
}: {
  groupPath: GroupPath;
}) => Context.Tag<GroupImpl<GroupPath>, GroupImpl<GroupPath>>;
declare const make: <Api_ extends Api.AnyWithProps, const GroupPath extends Path.All<Api.Groups<Api_>>>(_api: Api_, groupPath: GroupPath) => Layer.Layer<GroupImpl<GroupPath>, never, GroupImpl.FromGroupWithPath<GroupPath, Api.Groups<Api_>> | FunctionImpl.FromGroupAtPath<GroupPath, Api.Groups<Api_>>>;
declare namespace GroupImpl {
  type FromGroups<Groups extends GroupSpec.Any> = Groups extends never ? never : Groups extends GroupSpec.AnyWithProps ? GroupImpl<GroupSpec.Name<Groups>> : never;
  type FromGroupWithPath<GroupPath extends string, Group extends GroupSpec.AnyWithProps> = Path.SubGroupsAt<Group, GroupPath> extends infer SubGroupPaths ? SubGroupPaths extends string ? GroupImpl<SubGroupPaths> : never : never;
}
//#endregion
export { GroupImpl, GroupImpl_d_exports, make };
//# sourceMappingURL=GroupImpl.d.ts.map