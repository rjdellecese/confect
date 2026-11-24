/**
 * Node-only registration entry point for codegen. Implement a Node group's
 * actions with `FunctionImpl.make` from `confect/_generated/server` rather than
 * importing this entry point.
 *
 * @module
 *
 * @internal
 */

/**
 * Generated modules register a Node group's actions. Define the group with
 * `GroupSpec.makeNode()` and implement its actions with `FunctionImpl.make`
 * from `confect/_generated/server` instead of registering them directly.
 *
 * @internal
 */
export * as RegisteredNodeFunction from "./RegisteredNodeFunction";
