import { ConfectApiBuilder } from "@rjdellecese/confect";
import { Api } from "../api";

export const Groups = ConfectApiBuilder.group(
  Api,
  "groups",
  (handlers) => handlers,
);
