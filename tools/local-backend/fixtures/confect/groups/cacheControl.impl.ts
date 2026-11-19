import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import { control, snapshot } from "./cacheControl";
import cacheControlSpec from "./cacheControl.spec";

const controlImpl = FunctionImpl.make(cacheControlSpec, "control", control);

export default GroupImpl.make(cacheControlSpec).pipe(
  Layer.provide(controlImpl),
  Layer.provide(FunctionImpl.make(cacheControlSpec, "snapshot", snapshot)),
  GroupImpl.finalize,
);
