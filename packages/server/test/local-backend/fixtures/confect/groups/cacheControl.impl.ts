import { FunctionImpl, GroupImpl } from "@confect/server";
import { Layer } from "effect";
import api from "../_generated/api";
import { control } from "./cacheControl";
import cacheControl from "./cacheControl.spec";

const controlImpl = FunctionImpl.make(api, cacheControl, "control", control);

export default GroupImpl.make(api, cacheControl).pipe(
  Layer.provide(controlImpl),
  GroupImpl.finalize,
);
