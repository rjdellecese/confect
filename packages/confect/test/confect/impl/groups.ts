import { GroupImpl } from "@rjdellecese/confect";
import { api } from "../api";

export const groups = GroupImpl.make(api, "groups");
