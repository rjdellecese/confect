import { GroupSpec } from "./GroupSpec.js";

//#region src/api/Spec.d.ts
declare namespace Spec_d_exports {
  export { Spec, TypeId, isSpec, make };
}
declare const TypeId = "@rjdellecese/confect/api/Spec";
type TypeId = typeof TypeId;
declare const isSpec: (u: unknown) => u is Spec.Any;
interface Spec<Groups extends GroupSpec.AnyWithProps = never> {
  readonly [TypeId]: TypeId;
  readonly groups: { [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<Groups, GroupName> };
  add<Group extends GroupSpec.AnyWithProps>(group: Group): Spec<Groups | Group>;
}
declare namespace Spec {
  interface Any {
    readonly [TypeId]: TypeId;
  }
  interface AnyWithProps extends Any {
    readonly groups: {
      readonly [key: string]: GroupSpec.AnyWithProps;
    };
    add<Group extends GroupSpec.AnyWithProps>(group: Group): AnyWithProps;
  }
  type Groups<Spec_ extends AnyWithProps> = Spec_["groups"][keyof Spec_["groups"]];
}
declare const make: () => Spec;
//#endregion
export { Spec, Spec_d_exports, TypeId, isSpec, make };
//# sourceMappingURL=Spec.d.ts.map