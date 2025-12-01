import { ConfectApi } from "@rjdellecese/confect/api";
import schema from "./schema";
import spec from "./spec";

export const Api = ConfectApi.make(schema, spec);
