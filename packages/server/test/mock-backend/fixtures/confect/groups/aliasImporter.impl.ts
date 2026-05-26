import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "../_generated/api";
import aliasImporter from "~/groups/aliasImporter.spec";

const echo = FunctionImpl.make(api, aliasImporter, "echo", () =>
  Effect.succeed("aliased"),
);

export default GroupImpl.make(api, aliasImporter).pipe(
  Layer.provide(echo),
  GroupImpl.finalize,
);
