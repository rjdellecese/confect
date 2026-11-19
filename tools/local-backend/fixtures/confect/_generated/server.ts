import * as FunctionImpl_ from "@confect/server/FunctionImpl";
import * as MiddlewareImpl_ from "@confect/server/MiddlewareImpl";
import type schema from "./schema";

export * as GroupImpl from "@confect/server/GroupImpl";
export const FunctionImpl = FunctionImpl_.forSchema<typeof schema>();
export const MiddlewareImpl = MiddlewareImpl_.forSchema<typeof schema>();
