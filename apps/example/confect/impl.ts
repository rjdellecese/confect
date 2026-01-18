import { Impl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { notesAndRandom } from "./impl/notesAndRandom";
import { notes } from "./impl/notesAndRandom/notes";
import { random } from "./impl/notesAndRandom/random";

export default Impl.make(api).pipe(
  Layer.provide(
    notesAndRandom.pipe(Layer.provide(notes), Layer.provide(random)),
  ),
  Impl.finalize,
);
