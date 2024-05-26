import { ConfectFunctions } from "~/src";
import { confectSchema } from "~/test/convex/schema";

export const {
  action,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} = ConfectFunctions(confectSchema);
