import { FunctionSpec } from "../api/FunctionSpec.js";
import { GroupSpec, Path } from "../api/GroupSpec.js";
import { Api } from "./Api.js";
import { Handler } from "./RegistryItem.js";
import { Context, Layer } from "effect";

//#region src/server/FunctionImpl.d.ts
declare namespace FunctionImpl_d_exports {
  export { FunctionImpl, make };
}
interface FunctionImpl<GroupPath extends string, FunctionName extends string> {
  readonly groupPath: GroupPath;
  readonly functionName: FunctionName;
}
declare const FunctionImpl: <GroupPath extends string, FunctionName extends string>({
  groupPath,
  functionName
}: {
  groupPath: GroupPath;
  functionName: FunctionName;
}) => Context.Tag<FunctionImpl<GroupPath, FunctionName>, FunctionImpl<GroupPath, FunctionName>>;
declare const make: <Api_ extends Api.AnyWithProps, const GroupPath extends Path.All<Api.Groups<Api_>>, const FunctionName extends FunctionSpec.Name<GroupSpec.Functions<Path.GroupAt<Api.Groups<Api_>, GroupPath>>>>(api: Api_, groupPath: GroupPath, functionName: FunctionName, handler: Handler.WithName<Api.Schema<Api_>, GroupSpec.Functions<Path.GroupAt<Api.Groups<Api_>, GroupPath>>, FunctionName>) => Layer.Layer<FunctionImpl<GroupPath, FunctionName>>;
declare namespace FunctionImpl {
  /**
   * Get the function implementation service type for a specific group path and function name.
   */
  type ForGroupPathAndFunction<GroupPath extends string, FunctionName extends string> = FunctionImpl<GroupPath, FunctionName>;
  /**
   * Get all function implementation services required for a group at a given path.
   */
  type FromGroupAtPath<GroupPath extends string, Group extends GroupSpec.AnyWithProps> = Path.GroupAt<Group, GroupPath> extends infer GroupAtPath extends GroupSpec.AnyWithProps ? FunctionSpec.Name<GroupSpec.Functions<GroupAtPath>> extends infer FunctionNames extends string ? FunctionNames extends string ? FunctionImpl<GroupPath, FunctionNames> : never : never : never;
}
//#endregion
export { FunctionImpl, FunctionImpl_d_exports, make };
//# sourceMappingURL=FunctionImpl.d.ts.map