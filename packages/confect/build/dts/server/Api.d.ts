import { Spec } from "../api/Spec.js";
import { DatabaseSchema } from "./DatabaseSchema.js";
import { GenericSchema, SchemaDefinition } from "convex/server";

//#region src/server/Api.d.ts
declare namespace Api_d_exports {
  export { Api, TypeId, isApi, make };
}
declare const TypeId = "@rjdellecese/confect/server/Api";
type TypeId = typeof TypeId;
declare const isApi: (u: unknown) => u is Api.Any;
interface Api<Schema_ extends DatabaseSchema.AnyWithProps, Spec_ extends Spec.AnyWithProps> {
  readonly [TypeId]: TypeId;
  readonly spec: Spec_;
  readonly schema: Schema_;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}
declare namespace Api {
  interface Any {
    readonly [TypeId]: TypeId;
  }
  interface AnyWithProps extends Any {
    readonly spec: Spec.AnyWithProps;
    readonly schema: DatabaseSchema.AnyWithProps;
    readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
  }
  type Schema<Api_ extends AnyWithProps> = Api_["schema"];
  type Groups<Api_ extends AnyWithProps> = Spec.Groups<Api_["spec"]>;
}
declare const make: <Schema_ extends DatabaseSchema.AnyWithProps, Spec_ extends Spec.AnyWithProps>(schema: Schema_, spec: Spec_) => Api<Schema_, Spec_>;
//#endregion
export { Api, Api_d_exports, TypeId, isApi, make };
//# sourceMappingURL=Api.d.ts.map