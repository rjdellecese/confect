import { ConfectApiBuilder } from "@rjdellecese/confect";
import Api from "../_generated/api";

export const Groups = ConfectApiBuilder.group(
  Api,
  "groups",
  (handlers) => handlers,
);
