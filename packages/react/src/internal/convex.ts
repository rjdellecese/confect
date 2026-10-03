import { version } from "convex";
import * as ConvexReact from "convex/react";
import * as Predicate from "effect/Predicate";
import type { ConvexHooks } from "./hooks";

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
