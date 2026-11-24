import { Component } from "@confect/core";
import spec from "./spec";
import { scope } from "./id";

/**
 * Publishable contract for this component's public functions and scoped IDs.
 * Pass it to `Component.bind` with an installed instance from the generated
 * components registry to call those functions from the installing backend.
 *
 * **Details**
 *
 * Binding preserves native function references and rebases this definition's IDs
 * to the installed instance. Internal functions are not exposed.
 *
 * @category models
 */
const component: Component.Component<typeof spec, typeof scope, "counters" | "_storage" | "_scheduled_functions"> = Component.make(spec, scope, ["counters", "_storage", "_scheduled_functions"]);
export default component;
