import { ConfectApiGroupImpl } from "@rjdellecese/confect";
import Api from "../_generated/api";

export const Groups = ConfectApiGroupImpl.make(
  Api,
  "groups",
  (handlers) => handlers,
);
