import { GroupImpl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { cacheControl } from "./groups/cacheControl.impl";
import { cacheStubbing } from "./groups/cacheStubbing.impl";

export const groups = GroupImpl.make(api, "groups").pipe(
  Layer.provide(cacheControl),
  Layer.provide(cacheStubbing),
);
