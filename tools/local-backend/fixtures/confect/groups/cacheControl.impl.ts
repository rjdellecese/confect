import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import { control, snapshot } from "./cacheControl";
import cacheControl from "./cacheControl.spec";

const controlImpl = FunctionImpl.make(cacheControl, "control", control);

export default GroupImpl.make(cacheControl).pipe(
  Layer.provide(controlImpl),
  Layer.provide(FunctionImpl.make(cacheControl, "snapshot", snapshot)),
  GroupImpl.finalize,
);
