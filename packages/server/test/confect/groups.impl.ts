import { GroupImpl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { notes } from "./groups/notes.impl";
import { random } from "./groups/random.impl";
import { runners } from "./groups/runners.impl";

export const groups = GroupImpl.make(api, "groups").pipe(
  Layer.provide(notes),
  Layer.provide(random),
  Layer.provide(runners),
);
