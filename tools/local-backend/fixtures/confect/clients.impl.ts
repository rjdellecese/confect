import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { echoAction, echoMutation, echoQuery, read, write } from "./clients";
import spec from "./clients.spec";

export default GroupImpl.make(databaseSchema, spec).pipe(
  Layer.provide(
    FunctionImpl.make(databaseSchema, spec, "echoQuery", echoQuery),
  ),
  Layer.provide(
    FunctionImpl.make(databaseSchema, spec, "echoMutation", echoMutation),
  ),
  Layer.provide(
    FunctionImpl.make(databaseSchema, spec, "echoAction", echoAction),
  ),
  Layer.provide(FunctionImpl.make(databaseSchema, spec, "read", read)),
  Layer.provide(FunctionImpl.make(databaseSchema, spec, "write", write)),
  GroupImpl.finalize,
);
