import { FunctionSpec } from "./FunctionSpec.js";
import { GroupSpec } from "./GroupSpec.js";
import { Spec } from "./Spec.js";
import { Schema, Types } from "effect";

//#region src/api/Refs.d.ts
declare namespace Refs_d_exports {
  export { Ref, Refs, getConvexFunctionName, getFunction, justInternal, justPublic, make };
}
type Refs<Spec_ extends Spec.AnyWithProps> = Types.Simplify<Helper<Spec.Groups<Spec_>>>;
type Helper<Groups extends GroupSpec.AnyWithProps> = { [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<Groups, GroupName> extends infer Group extends GroupSpec.AnyWithProps ? GroupSpec.Groups<Group> extends infer SubGroups extends GroupSpec.AnyWithProps ? Types.Simplify<Helper<SubGroups> & { [FunctionName in FunctionSpec.Name<GroupSpec.Functions<Group>>]: FunctionSpec.WithName<GroupSpec.Functions<Group>, FunctionName> extends infer Function extends FunctionSpec.AnyWithProps ? Ref<FunctionSpec.GetFunctionType<Function>, FunctionSpec.GetFunctionVisibility<Function>, FunctionSpec.Args<Function>, FunctionSpec.Returns<Function>> : never }> : never : never };
type FilterRefs<Refs_, Predicate$1> = Types.Simplify<{ [K in keyof Refs_ as Refs_[K] extends Predicate$1 ? K : Refs_[K] extends Ref.Any ? never : FilterRefs<Refs_[K], Predicate$1> extends Record<string, never> ? never : K]: Refs_[K] extends Predicate$1 ? Refs_[K] : FilterRefs<Refs_[K], Predicate$1> }>;
declare const justInternal: <Refs_ extends Refs.AnyWithProps>(refs: Refs_) => FilterRefs<Refs_, Ref.AnyInternal>;
declare const justPublic: <Refs_ extends Refs.AnyWithProps>(refs: Refs_) => FilterRefs<Refs_, Ref.AnyPublic>;
declare namespace Refs {
  type AnyWithProps = {
    readonly [key: string]: Refs.AnyWithProps;
  } | Ref.Any;
}
type HiddenFunction<Ref_ extends Ref.Any> = FunctionSpec<Ref.FunctionType<Ref_>, Ref.FunctionVisibility<Ref_>, string, Ref.Args<Ref_>, Ref.Returns<Ref_>>;
declare const getFunction: <FunctionType extends FunctionSpec.FunctionType, FunctionVisibility extends FunctionSpec.FunctionVisibility, Args extends Schema.Schema.AnyNoContext, Returns extends Schema.Schema.AnyNoContext, Ref_ extends Ref<FunctionType, FunctionVisibility, Args, Returns>>(ref: Ref_) => HiddenFunction<Ref_>;
type HiddenConvexFunctionName = string;
declare const getConvexFunctionName: <FunctionType extends FunctionSpec.FunctionType, FunctionVisibility extends FunctionSpec.FunctionVisibility, Args extends Schema.Schema.AnyNoContext, Returns extends Schema.Schema.AnyNoContext>(ref: Ref<FunctionType, FunctionVisibility, Args, Returns>) => HiddenConvexFunctionName;
interface Ref<_FunctionType extends FunctionSpec.FunctionType, _FunctionVisibility extends FunctionSpec.FunctionVisibility, _Args extends Schema.Schema.AnyNoContext, _Returns extends Schema.Schema.AnyNoContext> {
  readonly _FunctionType?: _FunctionType;
  readonly _FunctionVisibility?: _FunctionVisibility;
  readonly _Args?: _Args;
  readonly _Returns?: _Returns;
}
declare namespace Ref {
  interface Any extends Ref<any, any, any, any> {}
  interface AnyInternal extends Ref<any, "Internal", any, any> {}
  interface AnyPublic extends Ref<any, "Public", any, any> {}
  interface AnyQuery extends Ref<"Query", FunctionSpec.FunctionVisibility, Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext> {}
  interface AnyMutation extends Ref<"Query", FunctionSpec.FunctionVisibility, Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext> {}
  interface AnyAction extends Ref<"Action", FunctionSpec.FunctionVisibility, Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext> {}
  interface AnyPublicQuery extends Ref<"Query", "Public", Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext> {}
  interface AnyPublicMutation extends Ref<"Mutation", "Public", Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext> {}
  interface AnyPublicAction extends Ref<"Action", "Public", Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext> {}
  type FunctionType<Ref_> = Ref_ extends Ref<infer FunctionType_, infer _FunctionVisibility, infer _Args, infer _Returns> ? FunctionType_ : never;
  type FunctionVisibility<Ref_> = Ref_ extends Ref<infer _FunctionType, infer FunctionVisibility_, infer _Args, infer _Returns> ? FunctionVisibility_ : never;
  type Args<Ref_> = Ref_ extends Ref<infer _FunctionType, infer _FunctionVisibility, infer Args_, infer _Returns> ? Args_ : never;
  type Returns<Ref_> = Ref_ extends Ref<infer _FunctionType, infer _FunctionVisibility, infer _Args, infer Returns_> ? Returns_ : never;
}
declare const make: <Spec_ extends Spec.AnyWithProps>(spec: Spec_) => Refs<Spec_>;
//#endregion
export { Ref, Refs, Refs_d_exports, getConvexFunctionName, getFunction, justInternal, justPublic, make };
//# sourceMappingURL=Refs.d.ts.map