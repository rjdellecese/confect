import { Refs } from "@confect/core";
import spec from "./spec";

/**
 * Typed function references grouped by path and function name. Pass a leaf
 * reference to a Confect runner or scheduler inside this component rather than calling it
 * directly.
 *
 * **Details**
 *
 * Both views are for use inside this component. An installing backend can bind
 * the generated component contract to call its public functions; clients cannot
 * call component functions directly. Internal functions stay private. Each view omits groups with no matching functions.
 * Each Confect reference carries its argument, result, and declared error types,
 * including errors from attached middleware. Codecs are evaluated lazily.
 *
 * **Gotchas**
 *
 * Both views share one tree at runtime. Convex enforces visibility on the
 * deployed functions.
 *
 * @category references
 */
const refs: Refs.FromSpec<typeof spec> = Refs.make(spec);

export default refs;
