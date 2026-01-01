import { Impl, Server } from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import { api } from "./api";
import { Groups } from "./api/groups";
import { Notes } from "./api/groups/notes";
import { Random } from "./api/groups/random";

export default Server.make(api).pipe(
  Effect.provide(
    Impl.make(api).pipe(
      Layer.provide(Groups.pipe(Layer.provide(Notes), Layer.provide(Random))),
    ),
  ),
  Effect.runSync,
);
