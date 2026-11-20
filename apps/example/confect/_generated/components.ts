import type { Component } from "@confect/core";
import { componentsGeneric } from "convex/server";

export type Components = {
  "workpool": Component.Mounted<import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">, "workpool">;
};

export const components: Components = componentsGeneric() as any;
