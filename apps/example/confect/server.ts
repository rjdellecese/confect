import { Impl, Server } from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import api from "./_generated/api";
import { groups } from "./impl/groups";
import { notes } from "./impl/groups/notes";
import { random } from "./impl/groups/random";

export default Server.make(api).pipe(
  Effect.provide(
    Impl.make(api).pipe(
      Layer.provide(groups.pipe(Layer.provide(notes), Layer.provide(random))),
    ),
  ),
  Effect.runSync,
);
