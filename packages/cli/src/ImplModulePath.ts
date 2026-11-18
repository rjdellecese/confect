import * as Schema from "effect/Schema";
import * as RelativeModulePath from "./RelativeModulePath";

export const ImplModulePath = RelativeModulePath.withSuffix(".impl.ts").pipe(
  Schema.brand("@confect/cli/ImplModulePath"),
);

export type ImplModulePath = typeof ImplModulePath.Type;
