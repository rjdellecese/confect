import type { Component } from "@confect/core";
import { componentsGeneric } from "convex/server";

/**
 * Map from installed component names to their typed `ComponentApi` function
 * references.
 *
 * @category models
 */
export type Components = {
  "first": Component.Mounted<import("../../components/counter/convex/_generated/component.js").ComponentApi<"first">, "first">;
  "left": Component.Mounted<import("../../components/parent/convex/_generated/component.js").ComponentApi<"left">, "left">;
  "right": Component.Mounted<import("../../components/parent/convex/_generated/component.js").ComponentApi<"right">, "right">;
  "second": Component.Mounted<import("../../components/counter/convex/_generated/component.js").ComponentApi<"second">, "second">;
};

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
