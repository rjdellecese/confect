import { GroupImpl } from "@confect/server";
import { Layer } from "effect";
import api from "../_generated/api";
import { notes } from "../impl/groups/notes";
import { random } from "../impl/groups/random";
import { runners } from "../impl/groups/runners";

export const groups = GroupImpl.make(api, "groups").pipe(
  Layer.provide(notes),
  Layer.provide(random),
  Layer.provide(runners),
);
