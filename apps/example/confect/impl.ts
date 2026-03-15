import { Impl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { env } from "./env.impl";
import { notesAndRandom } from "./notesAndRandom.impl";
import { workpool } from "./workpool.impl";

export default Impl.make(api).pipe(
  Layer.provide(env),
  Layer.provide(notesAndRandom),
  Layer.provide(workpool),
  Impl.finalize,
);
