import { FunctionImpl, GroupImpl } from "@confect/server";
import { Layer } from "effect";
import databaseSchema from "../_generated/schema";
import { control } from "./cacheControl";
import cacheControl from "./cacheControl.spec";

const controlImpl = FunctionImpl.make(
  databaseSchema,
  cacheControl,
  "control",
  control,
);

export default GroupImpl.make(databaseSchema, cacheControl).pipe(
  Layer.provide(controlImpl),
  GroupImpl.finalize,
);
