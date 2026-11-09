import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { control, snapshot } from "./cacheControl";
import cacheControl from "./cacheControl.spec";

const controlImpl = FunctionImpl.make(
  databaseSchema,
  cacheControl,
  "control",
  control,
);

export default GroupImpl.make(databaseSchema, cacheControl).pipe(
  Layer.provide(controlImpl),
  Layer.provide(
    FunctionImpl.make(databaseSchema, cacheControl, "snapshot", snapshot),
  ),
  GroupImpl.finalize,
);
