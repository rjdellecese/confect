import { GroupImpl } from "@confect/server";
import api from "../_generated/api";

export const groups = GroupImpl.make(api, "groups");
