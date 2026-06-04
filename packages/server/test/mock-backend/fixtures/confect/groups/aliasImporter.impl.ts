import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import aliasImporter from "~/groups/aliasImporter.spec";

const echo = FunctionImpl.make(databaseSchema, aliasImporter, "echo", () =>
  Effect.succeed("aliased"),
);

export default GroupImpl.make(databaseSchema, aliasImporter).pipe(
  Layer.provide(echo),
  GroupImpl.finalize,
);
