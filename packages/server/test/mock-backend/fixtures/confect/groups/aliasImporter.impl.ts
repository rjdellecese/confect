import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import aliasImporterSpec from "~/groups/aliasImporter.spec";
import { FunctionImpl, GroupImpl } from "../_generated/server";

const echo = FunctionImpl.make(aliasImporterSpec, "echo", () =>
  Effect.succeed("aliased"),
);

export default GroupImpl.make(aliasImporterSpec).pipe(
  Layer.provide(echo),
  GroupImpl.finalize,
);
