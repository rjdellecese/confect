import { ConfectApi } from "@rjdellecese/confect/server";
import schema from "./schema";
import spec from "./spec";

export const Api = ConfectApi.make(schema, spec);
