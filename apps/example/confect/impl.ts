import { Impl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { env } from "./impl/env";
import { notesAndRandom } from "./impl/notesAndRandom";
import { workpool } from "./impl/workpool";

export default Impl.make(api).pipe(
  Layer.provide(env),
  Layer.provide(notesAndRandom),
  Layer.provide(workpool),
  Impl.finalize,
);
