import { componentsGeneric } from "convex/server";

export type Components = {
  "workpool": import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
};

export const components: Components = componentsGeneric() as unknown as Components;
