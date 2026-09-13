import { version } from "convex";
import * as ConvexReact from "convex/react";
import * as Predicate from "effect/Predicate";
import type { ConvexHooks } from "./hooks";

// SAFETY: Convex runtime-exports this internal hook but omits its declaration. The caller gates its non-throwing signature on convex >= 1.36.0 before invoking it.
const usePaginatedQueryInternal = Predicate.hasProperty(
  ConvexReact,
  "usePaginatedQueryInternal",
)
  ? (ConvexReact.usePaginatedQueryInternal as ConvexHooks["usePaginatedQueryInternal"])
  : undefined;

export const convexHooks: ConvexHooks = {
  convexVersion: version,
  useQuery: ConvexReact.useQuery,
  useMutation: ConvexReact.useMutation,
  useAction: ConvexReact.useAction,
  useQueries: ConvexReact.useQueries,
  usePaginatedQueryInternal,
};
