import { Api, DatabaseSchema } from "@confect/server";
import schema from "../schema";
import spec from "../spec";

export default Api.make(schema, spec);
