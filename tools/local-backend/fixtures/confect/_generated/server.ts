import * as FunctionImpl_ from "@confect/server/FunctionImpl";
import * as MiddlewareImpl_ from "@confect/server/MiddlewareImpl";
import type schema from "./schema";

/**
 * Assemble a group implementation with GroupImpl.make(groupSpec), provide its function
 * and middleware layers, then call GroupImpl.finalize to check completeness.
 * @category Layers
 */
export * as GroupImpl from "@confect/server/GroupImpl";
/**
 * Implement a function with FunctionImpl.make(groupSpec, name, handler).
 * The handler receives decoded arguments and can use services typed to this application's database.
 * @category Layers
 */
export const FunctionImpl = FunctionImpl_.forSchema<typeof schema>();
/**
 * Implement middleware with services typed to this application's database.
 * Use make for a shared implementation, makeByFunctionType for separate handlers,
 * or provides to supply the service declared by the middleware spec.
 * @category Layers
 */
export const MiddlewareImpl = MiddlewareImpl_.forSchema<typeof schema>();
