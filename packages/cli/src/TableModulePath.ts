import * as Schema from "effect/Schema";
import * as RelativeModulePath from "./RelativeModulePath";

export const TableModulePath = RelativeModulePath.withSuffix(".ts")
  .check(Schema.makeFilter((value) => value.split(/[/\\]/)[0] === "tables"))
  .pipe(Schema.brand("@confect/cli/TableModulePath"));

export type TableModulePath = typeof TableModulePath.Type;
