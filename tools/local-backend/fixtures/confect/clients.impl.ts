import { GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "./_generated/server";
import { echoAction, echoMutation, echoQuery, read, write } from "./clients";
import spec from "./clients.spec";

export default GroupImpl.make(spec).pipe(
  Layer.provide(FunctionImpl.make(spec, "echoQuery", echoQuery)),
  Layer.provide(FunctionImpl.make(spec, "echoMutation", echoMutation)),
  Layer.provide(FunctionImpl.make(spec, "echoAction", echoAction)),
  Layer.provide(FunctionImpl.make(spec, "read", read)),
  Layer.provide(FunctionImpl.make(spec, "write", write)),
  GroupImpl.finalize,
);
