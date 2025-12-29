import { ConfectApi } from "@rjdellecese/confect";
import schema from "./schema";
import spec from "./spec";

export const Api = ConfectApi.make(schema, spec);
