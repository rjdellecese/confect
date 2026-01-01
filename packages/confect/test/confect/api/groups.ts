import { GroupImpl } from "@rjdellecese/confect";
import { api } from "../api";

export const Groups = GroupImpl.make(api, "groups");
