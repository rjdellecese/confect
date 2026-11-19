import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import { echoAction, echoMutation, echoQuery, read, write } from "./clients";
import clientsSpec from "./clients.spec";

export default GroupImpl.make(clientsSpec).pipe(
  Layer.provide(FunctionImpl.make(clientsSpec, "echoQuery", echoQuery)),
  Layer.provide(FunctionImpl.make(clientsSpec, "echoMutation", echoMutation)),
  Layer.provide(FunctionImpl.make(clientsSpec, "echoAction", echoAction)),
  Layer.provide(FunctionImpl.make(clientsSpec, "read", read)),
  Layer.provide(FunctionImpl.make(clientsSpec, "write", write)),
  GroupImpl.finalize,
);
