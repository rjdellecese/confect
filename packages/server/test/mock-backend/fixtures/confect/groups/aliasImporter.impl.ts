import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import aliasImporter from "~/groups/aliasImporter.spec";
import { FunctionImpl } from "../_generated/server";

const echo = FunctionImpl.make(aliasImporter, "echo", () =>
  Effect.succeed("aliased"),
);

export default GroupImpl.make(aliasImporter).pipe(
  Layer.provide(echo),
  GroupImpl.finalize,
);
