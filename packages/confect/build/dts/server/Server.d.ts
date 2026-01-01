import { FunctionSpec } from "../api/FunctionSpec.js";
import { GroupSpec } from "../api/GroupSpec.js";
import { Spec } from "../api/Spec.js";
import { Api } from "./Api.js";
import { Effect, Types } from "effect";
import { DefaultFunctionArgs, FunctionVisibility, RegisteredAction, RegisteredMutation, RegisteredQuery } from "convex/server";

//#region src/server/Server.d.ts
declare namespace Server_d_exports {
  export { RegisteredFunction, RegisteredFunctions, Server, TypeId, isRegisteredFunction, isServer, make };
}
type RegisteredFunction = RegisteredQuery<FunctionVisibility, DefaultFunctionArgs, any> | RegisteredMutation<FunctionVisibility, DefaultFunctionArgs, any> | RegisteredAction<FunctionVisibility, DefaultFunctionArgs, any>;
declare const isRegisteredFunction: (u: unknown) => u is RegisteredFunction;
declare const TypeId = "@rjdellecese/confect/server/Server";
type TypeId = typeof TypeId;
declare const isServer: (u: unknown) => u is Server<Api.AnyWithProps>;
type RegisteredFunctions<Spec_ extends Spec.AnyWithProps> = Types.Simplify<RegisteredFunctions.Helper<Spec.Groups<Spec_>>>;
interface Server<Api_ extends Api.AnyWithProps> {
  readonly [TypeId]: TypeId;
  readonly registeredFunctions: RegisteredFunctions<Api_["spec"]>;
}
declare const make: <Api_ extends Api.AnyWithProps>(api: Api_) => Effect.Effect<Server<Api_>, never, never>;
declare namespace RegisteredFunctions {
  interface AnyWithProps {
    readonly [key: string]: RegisteredFunction | AnyWithProps;
  }
  type Helper<Groups extends GroupSpec.AnyWithProps> = { [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<Groups, GroupName> extends infer Group extends GroupSpec.AnyWithProps ? GroupSpec.Groups<Group> extends infer SubGroups extends GroupSpec.AnyWithProps ? Types.Simplify<Helper<SubGroups> & { [FunctionName in FunctionSpec.Name<GroupSpec.Functions<Group>>]: FunctionSpec.WithName<GroupSpec.Functions<Group>, FunctionName> extends infer Function extends FunctionSpec.AnyWithProps ? FunctionSpec.RegisteredFunction<Function> : never }> : { [FunctionName in FunctionSpec.Name<GroupSpec.Functions<Group>>]: FunctionSpec.WithName<GroupSpec.Functions<Group>, FunctionName> extends infer Function extends FunctionSpec.AnyWithProps ? FunctionSpec.RegisteredFunction<Function> : never } : never };
}
//#endregion
export { RegisteredFunction, RegisteredFunctions, Server, Server_d_exports, TypeId, isRegisteredFunction, isServer, make };
//# sourceMappingURL=Server.d.ts.map