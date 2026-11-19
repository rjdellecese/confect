import { DateTime } from "luxon";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import cjsImporter from "./cjsImporter.spec";

const now = FunctionImpl.make(cjsImporter, "now", () =>
  Effect.sync(() => DateTime.now().toISO() ?? ""),
);

export default GroupImpl.make(cjsImporter).pipe(
  Layer.provide(now),
  GroupImpl.finalize,
);
