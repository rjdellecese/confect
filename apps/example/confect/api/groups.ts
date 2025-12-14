import { ConfectApiBuilder } from "@rjdellecese/confect/server";
import { Api } from "../api";

export const Groups = ConfectApiBuilder.group(
  Api,
  "groups",
  (handlers) => handlers,
);
