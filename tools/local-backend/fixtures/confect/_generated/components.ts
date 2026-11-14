import { componentsGeneric } from "convex/server";

export type Components = {
  "first": import("../../components/counter/convex/_generated/component.js").ComponentApi<"first">;
  "left": import("../../components/parent/convex/_generated/component.js").ComponentApi<"left">;
  "right": import("../../components/parent/convex/_generated/component.js").ComponentApi<"right">;
  "second": import("../../components/counter/convex/_generated/component.js").ComponentApi<"second">;
};

export const components: Components = componentsGeneric() as any;
