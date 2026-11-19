import type { Component } from "@confect/core";
import { componentsGeneric } from "convex/server";

export type Components = {
  "child": Component.Mounted<import("../../../counter/convex/_generated/component.js").ComponentApi<"child">, "child">;
};

export const components: Components = componentsGeneric() as any;
