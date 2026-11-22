import { Refs } from "@confect/core";
import spec from "./spec";

/**
 * Typed function references grouped by path and function name. Pass a leaf
 * reference to a Confect client, runner, or scheduler rather than calling it
 * directly.
 *
 * **Details**
 *
 * The `public` view exposes client-callable references and `internal` exposes
 * server-only references. Each carries its argument, result, and declared error
 * types; Confect evaluates codecs lazily.
 *
 * **Gotchas**
 *
 * The views filter references at the type level. Convex enforces visibility on the
 * deployed functions.
 *
 * @category references
 */
const refs: Refs.FromSpec<typeof spec> = Refs.make(spec);

export default refs;
