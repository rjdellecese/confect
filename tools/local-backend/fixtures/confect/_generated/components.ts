import { componentsGeneric } from "convex/server";

/** Installed component names mapped to their typed ComponentApi function references. */
export type Components = {};

/**
 * Function references for components installed with app.use in convex/convex.config.ts.
 * Entries use their installed names. Pass their references to Convex component APIs or native contexts.
 * This registry is available before Convex codegen and does not invoke component functions.
 */
export const components: Components = componentsGeneric() as any;
