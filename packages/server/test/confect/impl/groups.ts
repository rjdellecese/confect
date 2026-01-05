import { GroupImpl } from "../../../src/index";
import { api } from "../api";

export const groups = GroupImpl.make(api, "groups");
