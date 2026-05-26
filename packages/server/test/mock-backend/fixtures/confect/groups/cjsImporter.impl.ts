import { FunctionImpl, GroupImpl } from "@confect/server";
import { DateTime } from "luxon";
import { Effect, Layer } from "effect";
import api from "../_generated/api";
import cjsImporter from "./cjsImporter.spec";

const now = FunctionImpl.make(api, cjsImporter, "now", () =>
  Effect.sync(() => DateTime.now().toISO()),
);

export default GroupImpl.make(api, cjsImporter).pipe(
  Layer.provide(now),
  GroupImpl.finalize,
);
