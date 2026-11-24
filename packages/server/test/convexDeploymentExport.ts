import { assert } from "@effect/vitest";
import type * as RegisteredFunction from "@confect/server/RegisteredFunction";
import type { Crons } from "convex/server";
import * as Predicate from "effect/Predicate";

export const convexDeploymentExport = (
  registered: Crons | RegisteredFunction.Any,
  hook: "export" | "exportArgs" | "exportReturns",
): string => {
  assert(Predicate.hasProperty(registered, hook));
  assert(
    typeof registered[hook] === "function" && registered[hook].length === 0,
  );
  // oxlint-disable-next-line typescript/no-unsafe-call -- Convex deployment calls these hooks to serialize crons and validators, but its public declarations omit them.
  const json: unknown = registered[hook]();
  assert(typeof json === "string");
  return json;
};
