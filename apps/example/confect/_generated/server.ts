import * as FunctionImpl_ from "@confect/server/FunctionImpl";
import * as MiddlewareImpl_ from "@confect/server/MiddlewareImpl";
import type schema from "./schema";

/**
 * Builders for a group's implementation layer. Start with
 * `GroupImpl.make(groupSpec)`, provide the function and middleware layers, then
 * call `GroupImpl.finalize` to check completeness.
 *
 * @category re-exports
 */
export * as GroupImpl from "@confect/server/GroupImpl";
/**
 * Builder for a function implementation layer. Pass the group spec, function name,
 * and handler to `FunctionImpl.make`. The handler receives decoded arguments and
 * services typed to this application's database.
 *
 * @category constructors
 */
export const FunctionImpl = FunctionImpl_.forSchema<typeof schema>();
/**
 * Builders for middleware implementation layers typed to this application's
 * database. Use `make` to share an implementation, `makeByFunctionType` for
 * distinct handlers, or `provides` to supply the service declared by the
 * middleware spec.
 *
 * @category constructors
 */
export const MiddlewareImpl = MiddlewareImpl_.forSchema<typeof schema>();
