import * as String from "effect/String";
import * as Schema from "effect/Schema";
import { ImplModulePath } from "./ImplModulePath";
import * as RelativeModulePath from "./RelativeModulePath";

export const SpecModulePath = RelativeModulePath.withSuffix(".spec.ts").pipe(
  Schema.brand("@confect/cli/SpecModulePath"),
);

export type SpecModulePath = typeof SpecModulePath.Type;

export const toImpl = (path: SpecModulePath): ImplModulePath =>
  ImplModulePath.make(`${String.slice(0, -".spec.ts".length)(path)}.impl.ts`);

export const fromImpl = (path: ImplModulePath): SpecModulePath =>
  SpecModulePath.make(`${String.slice(0, -".impl.ts".length)(path)}.spec.ts`);
