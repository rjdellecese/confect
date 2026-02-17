import { Impl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { notesAndRandom } from "./impl/notesAndRandom";

export default Impl.make(api).pipe(
  Layer.provide(notesAndRandom),
  Impl.finalize,
);
