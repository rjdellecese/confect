import { ConfectApi } from "@rjdellecese/confect/api";
import schema from "./schema";
import { Spec } from "./spec";

export const Api = ConfectApi.make(schema, Spec);
