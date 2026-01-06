import { Impl, Server } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "./_generated/api";
import { notesAndRandom } from "./impl/notesAndRandom";
import { notes } from "./impl/notesAndRandom/notes";
import { random } from "./impl/notesAndRandom/random";

export default Server.make(api).pipe(
  Effect.provide(
    Impl.make(api).pipe(
      Layer.provide(
        notesAndRandom.pipe(Layer.provide(notes), Layer.provide(random)),
      ),
    ),
  ),
  Effect.runSync,
);
