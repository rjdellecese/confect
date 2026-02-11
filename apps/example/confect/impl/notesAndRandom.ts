import { GroupImpl } from "@confect/server";
import { Layer } from "effect";
import api from "../_generated/api";
import { notes } from "./notesAndRandom/notes";
import { random } from "./notesAndRandom/random";

export const notesAndRandom = GroupImpl.make(api, "notesAndRandom").pipe(
  Layer.provide(notes),
  Layer.provide(random),
);
