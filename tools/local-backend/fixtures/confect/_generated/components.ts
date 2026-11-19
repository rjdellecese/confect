import type { Component } from "@confect/core";
import { componentsGeneric } from "convex/server";

export type Components = {
  "first": Component.Mounted<import("../../components/counter/convex/_generated/component.js").ComponentApi<"first">, "first">;
  "left": Component.Mounted<import("../../components/parent/convex/_generated/component.js").ComponentApi<"left">, "left">;
  "right": Component.Mounted<import("../../components/parent/convex/_generated/component.js").ComponentApi<"right">, "right">;
  "second": Component.Mounted<import("../../components/counter/convex/_generated/component.js").ComponentApi<"second">, "second">;
};

export const components: Components = componentsGeneric() as any;
