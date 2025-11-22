import { ConfectApiBuilder } from "@rjdellecese/confect/api";
import { Api } from "../api";

export const Groups = ConfectApiBuilder.group(
  Api,
  "groups",
  (handlers) => handlers,
);
