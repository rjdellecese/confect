import { FunctionImpl, GroupImpl } from "@confect/server";
import { Layer } from "effect";
import api from "../_generated/api";
import { control } from "./cacheControl";

const controlImpl = FunctionImpl.make(
  api,
  "groups.cacheControl",
  "control",
  control,
);

export const cacheControl = GroupImpl.make(api, "groups.cacheControl").pipe(
  Layer.provide(controlImpl),
);
