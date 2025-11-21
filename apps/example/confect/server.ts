import { ConfectApiBuilder, ConfectApiServer } from "@rjdellecese/confect/api";
import { Effect, Layer } from "effect";
import api from "./api";
import notes from "./api/notes";
import random from "./api/random";

export default ConfectApiServer.make.pipe(
  Effect.provide(
    ConfectApiBuilder.api(api).pipe(Layer.provide(notes), Layer.provide(random))
  ),
  Effect.runSync
);
