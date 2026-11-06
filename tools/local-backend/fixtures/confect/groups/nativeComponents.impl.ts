import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import schema from "../_generated/schema";
import { roundTrip } from "./nativeComponents";
import spec from "./nativeComponents.spec";

export default GroupImpl.make(schema, spec).pipe(
  Layer.provide(FunctionImpl.make(schema, spec, "roundTrip", roundTrip)),
  GroupImpl.finalize,
);
