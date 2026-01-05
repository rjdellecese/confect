import { Api } from "../../src/index";
import schema from "./schema";
import spec from "./spec";

export const api = Api.make(schema, spec);
