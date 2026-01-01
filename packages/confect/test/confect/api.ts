import { Api } from "@rjdellecese/confect";
import schema from "./schema";
import spec from "./spec";

export const api = Api.make(schema, spec);
