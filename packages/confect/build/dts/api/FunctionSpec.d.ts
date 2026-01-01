import { Schema } from "effect";
import { RegisteredAction, RegisteredMutation, RegisteredQuery } from "convex/server";

//#region src/api/FunctionSpec.d.ts
declare namespace FunctionSpec_d_exports {
  export { FunctionSpec, TypeId, action, internalAction, internalMutation, internalQuery, isFunctionSpec, mutation, query };
}
declare const TypeId = "@rjdellecese/confect/api/FunctionSpec";
type TypeId = typeof TypeId;
declare const isFunctionSpec: (u: unknown) => u is FunctionSpec.AnyWithProps;
interface FunctionSpec<FunctionType$1 extends FunctionSpec.FunctionType, FunctionVisibility$2 extends FunctionSpec.FunctionVisibility, Name$1 extends string, Args$1 extends Schema.Schema.AnyNoContext, Returns$1 extends Schema.Schema.AnyNoContext> {
  readonly [TypeId]: TypeId;
  readonly functionType: FunctionType$1;
  readonly functionVisibility: FunctionVisibility$2;
  readonly name: Name$1;
  readonly args: Args$1;
  readonly returns: Returns$1;
}
declare namespace FunctionSpec {
  interface Any {
    readonly [TypeId]: TypeId;
  }
  interface AnyWithProps extends FunctionSpec<FunctionType, FunctionVisibility, string, Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext> {}
  interface AnyWithPropsWithFunctionType<FunctionType_ extends FunctionType> extends FunctionSpec<FunctionType_, FunctionVisibility, string, Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext> {}
  type FunctionType = "Query" | "Mutation" | "Action";
  type GetFunctionType<Function$1 extends AnyWithProps> = Function$1["functionType"];
  type FunctionVisibility = "Public" | "Internal";
  type GetFunctionVisibility<Function$1 extends AnyWithProps> = Function$1["functionVisibility"];
  type Name<Function$1 extends AnyWithProps> = Function$1["name"];
  type Args<Function$1 extends AnyWithProps> = Function$1["args"];
  type Returns<Function$1 extends AnyWithProps> = Function$1["returns"];
  type WithName<Function$1 extends AnyWithProps, Name_ extends string> = Extract<Function$1, {
    readonly name: Name_;
  }>;
  type WithFunctionType<Function$1 extends AnyWithProps, FunctionType_ extends FunctionType> = Extract<Function$1, {
    readonly functionType: FunctionType_;
  }>;
  type ExcludeName<Function$1 extends AnyWithProps, Name_ extends Name<Function$1>> = Exclude<Function$1, {
    readonly name: Name_;
  }>;
  type RegisteredFunction<Function$1 extends FunctionSpec.AnyWithProps> = Function$1["functionType"] extends "Query" ? RegisteredQuery<Lowercase<GetFunctionVisibility<Function$1>>, Args<Function$1>["Encoded"], Promise<Returns<Function$1>["Encoded"]>> : Function$1["functionType"] extends "Mutation" ? RegisteredMutation<Lowercase<GetFunctionVisibility<Function$1>>, Args<Function$1>["Encoded"], Promise<Returns<Function$1>["Encoded"]>> : Function$1["functionType"] extends "Action" ? RegisteredAction<Lowercase<GetFunctionVisibility<Function$1>>, Args<Function$1>["Encoded"], Promise<Returns<Function$1>["Encoded"]>> : never;
}
declare const internalQuery: <const Name$1 extends string, Args$1 extends Schema.Schema.AnyNoContext, Returns$1 extends Schema.Schema.AnyNoContext>({
  name,
  args,
  returns
}: {
  name: Name$1;
  args: Args$1;
  returns: Returns$1;
}) => FunctionSpec<"Query", "Internal", Name$1, Args$1, Returns$1>;
declare const query: <const Name$1 extends string, Args$1 extends Schema.Schema.AnyNoContext, Returns$1 extends Schema.Schema.AnyNoContext>({
  name,
  args,
  returns
}: {
  name: Name$1;
  args: Args$1;
  returns: Returns$1;
}) => FunctionSpec<"Query", "Public", Name$1, Args$1, Returns$1>;
declare const internalMutation: <const Name$1 extends string, Args$1 extends Schema.Schema.AnyNoContext, Returns$1 extends Schema.Schema.AnyNoContext>({
  name,
  args,
  returns
}: {
  name: Name$1;
  args: Args$1;
  returns: Returns$1;
}) => FunctionSpec<"Mutation", "Internal", Name$1, Args$1, Returns$1>;
declare const mutation: <const Name$1 extends string, Args$1 extends Schema.Schema.AnyNoContext, Returns$1 extends Schema.Schema.AnyNoContext>({
  name,
  args,
  returns
}: {
  name: Name$1;
  args: Args$1;
  returns: Returns$1;
}) => FunctionSpec<"Mutation", "Public", Name$1, Args$1, Returns$1>;
declare const internalAction: <const Name$1 extends string, Args$1 extends Schema.Schema.AnyNoContext, Returns$1 extends Schema.Schema.AnyNoContext>({
  name,
  args,
  returns
}: {
  name: Name$1;
  args: Args$1;
  returns: Returns$1;
}) => FunctionSpec<"Action", "Internal", Name$1, Args$1, Returns$1>;
declare const action: <const Name$1 extends string, Args$1 extends Schema.Schema.AnyNoContext, Returns$1 extends Schema.Schema.AnyNoContext>({
  name,
  args,
  returns
}: {
  name: Name$1;
  args: Args$1;
  returns: Returns$1;
}) => FunctionSpec<"Action", "Public", Name$1, Args$1, Returns$1>;
//#endregion
export { FunctionSpec, FunctionSpec_d_exports, TypeId, action, internalAction, internalMutation, internalQuery, isFunctionSpec, mutation, query };
//# sourceMappingURL=FunctionSpec.d.ts.map