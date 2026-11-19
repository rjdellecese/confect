import { DateTime } from "luxon";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import cjsImporterSpec from "./cjsImporter.spec";

const now = FunctionImpl.make(cjsImporterSpec, "now", () =>
  Effect.sync(() => DateTime.now().toISO() ?? ""),
);

export default GroupImpl.make(cjsImporterSpec).pipe(
  Layer.provide(now),
  GroupImpl.finalize,
);
