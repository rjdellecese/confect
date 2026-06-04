import { FunctionImpl, GroupImpl } from "@confect/server";
import { DateTime } from "luxon";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import cjsImporter from "./cjsImporter.spec";

const now = FunctionImpl.make(databaseSchema, cjsImporter, "now", () =>
  Effect.sync(() => DateTime.now().toISO() ?? ""),
);

export default GroupImpl.make(databaseSchema, cjsImporter).pipe(
  Layer.provide(now),
  GroupImpl.finalize,
);
