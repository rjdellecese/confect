import { Api } from "./Api.js";
import { GroupImpl } from "./GroupImpl.js";
import { Context, Layer } from "effect";

//#region src/server/Impl.d.ts
declare namespace Impl_d_exports {
  export { Impl, make };
}
declare const Impl_base: Context.TagClass<Impl, "@rjdellecese/confect/server/Impl", {
  readonly api: Api.AnyWithProps;
  readonly context: Context.Context<never>;
}>;
declare class Impl extends Impl_base {}
declare const make: <Api_ extends Api.AnyWithProps>(api: Api_) => Layer.Layer<Impl, never, GroupImpl.FromGroups<Api.Groups<Api_>>>;
//#endregion
export { Impl, Impl_d_exports, make };
//# sourceMappingURL=Impl.d.ts.map