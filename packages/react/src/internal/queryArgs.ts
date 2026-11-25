import type { DefaultFunctionArgs } from "convex/server";
import { convexToJson } from "convex/values";
import type { Value } from "convex/values";

export const toWireArgs = (input: DefaultFunctionArgs) => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- convexToJson validates the full tree and throws on unsupported values; only expose the wire arguments after it succeeds.
  const args = input as Record<string, Value>;
  return { json: convexToJson(args), args };
};
