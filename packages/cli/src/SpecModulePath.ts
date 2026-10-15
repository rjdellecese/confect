import * as Schema from "effect/Schema";
import { ImplModulePath } from "./ImplModulePath";
import * as RelativeModulePath from "./RelativeModulePath";

export const SpecModulePath = RelativeModulePath.withSuffix(".spec.ts").pipe(
  Schema.brand("@confect/cli/SpecModulePath"),
);

export type SpecModulePath = typeof SpecModulePath.Type;

export const toImpl = (path: SpecModulePath): ImplModulePath =>
  ImplModulePath.make(`${path.slice(0, -".spec.ts".length)}.impl.ts`);

export const fromImpl = (path: ImplModulePath): SpecModulePath =>
  SpecModulePath.make(`${path.slice(0, -".impl.ts".length)}.spec.ts`);
