import { componentsGeneric } from "convex/server";

/**
 * Map from installed component names to their typed `ComponentApi` function
 * references.
 *
 * @category models
 */
export type Components = {};

/**
 * Function references for the components installed with `app.use` in
 * `convex/convex.config.ts`. Select a component by its installed name, then pass a
 * reference to a Convex component API or native context.
 *
 * **Details**
 *
 * The registry is available before Convex code generation. Reading a reference
 * does not invoke the component function.
 *
 * @category references
 */
export const components: Components = componentsGeneric() as any;
