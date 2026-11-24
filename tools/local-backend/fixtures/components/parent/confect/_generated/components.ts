import type { Component } from "@confect/core";
import { componentsGeneric } from "convex/server";

/**
 * Map from installed component names to their typed `ComponentApi` function
 * references.
 *
 * @category models
 */
export type Components = {
  "child": Component.Mounted<import("../../../counter/convex/_generated/component.js").ComponentApi<"child">, "child">;
};

/**
 * Native references for children installed by this component's Convex configuration.
 * To call a child through Confect, bind its contract to the registry entry with
 * `Component.bind` and pass the generated `scope` as `parentScope`.
 *
 * **Details**
 *
 * The registry is available before Convex code generation. Reading a reference
 * does not invoke the component function.
 *
 * @category references
 */
export const components: Components = componentsGeneric() as any;
