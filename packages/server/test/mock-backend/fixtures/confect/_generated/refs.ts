import { Refs } from "@confect/core";
import spec from "./spec";

/**
 * Typed function references nested by group path and function name.
 * public exposes client-callable functions; internal exposes server-only functions.
 * These are type-filtered views, not a runtime authorization boundary.
 * Each leaf is a Ref carrying argument, return, and declared error types, not a callable function.
 * Pass leaves to Confect clients, runners, or the scheduler; Confect codecs are evaluated lazily.
 * @category References
 */
const refs: Refs.FromSpec<typeof spec> = Refs.make(spec);

export default refs;
